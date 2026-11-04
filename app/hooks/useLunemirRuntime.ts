"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseCharacterFile } from "../../lib/lunemir/character-import";
import { compileContext } from "../../lib/lunemir/context";
import { createId, createSampleCharacter, DEFAULT_MODEL_CONFIG } from "../../lib/lunemir/defaults";
import { streamChatCompletion, testModelConnection } from "../../lib/lunemir/model-client";
import {
  createBackup,
  getConversation,
  getSettings,
  listCharacters,
  restoreBackup,
  saveCharacter,
  saveConversation,
  saveSettings,
} from "../../lib/lunemir/storage";
import type {
  CharacterRecord,
  ContextReport,
  ConversationRecord,
  ImportPreview,
  ModelConfig,
  StoredMessage,
} from "../../lib/lunemir/types";

function initialMessage(character: CharacterRecord): StoredMessage[] {
  if (!character.firstMessage.trim()) return [];
  return [{
    id: createId("message"),
    role: "assistant",
    content: character.firstMessage,
    createdAt: new Date().toISOString(),
    status: "complete",
  }];
}

async function loadOrCreateConversation(character: CharacterRecord) {
  const existing = await getConversation(character.id);
  if (existing) return existing;
  const now = new Date().toISOString();
  const conversation: ConversationRecord = {
    id: createId("conversation"),
    schemaVersion: 1,
    characterId: character.id,
    title: character.firstMessage.slice(0, 28) || `与 ${character.name} 的对话`,
    messages: initialMessage(character),
    createdAt: now,
    updatedAt: now,
  };
  await saveConversation(conversation);
  return conversation;
}

export function useLunemirRuntime() {
  const [ready, setReady] = useState(false);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [activeCharacterId, setActiveCharacterId] = useState("");
  const [conversation, setConversation] = useState<ConversationRecord | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const [apiKey, setApiKey] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "connected" | "error">("idle");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [runtimeError, setRuntimeError] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [contextReport, setContextReport] = useState<ContextReport | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const contextLimitRef = useRef(DEFAULT_MODEL_CONFIG.contextLimit);

  const activeCharacter = useMemo(
    () => characters.find((character) => character.id === activeCharacterId) ?? characters[0] ?? null,
    [activeCharacterId, characters],
  );

  useEffect(() => {
    contextLimitRef.current = modelConfig.contextLimit;
  }, [modelConfig.contextLimit]);

  const refreshContext = useCallback((character: CharacterRecord, nextMessages: StoredMessage[]) => {
    setContextReport(compileContext(character, nextMessages, contextLimitRef.current).report);
  }, []);

  const selectCharacter = useCallback(async (character: CharacterRecord) => {
    setActiveCharacterId(character.id);
    const nextConversation = await loadOrCreateConversation(character);
    setConversation(nextConversation);
    setMessages(nextConversation.messages);
    refreshContext(character, nextConversation.messages);
    const settings = await getSettings();
    await saveSettings({ ...settings, activeCharacterId: character.id, updatedAt: new Date().toISOString() });
  }, [refreshContext]);

  const reloadAll = useCallback(async () => {
    let storedCharacters = await listCharacters();
    if (storedCharacters.length === 0) {
      const sample = createSampleCharacter();
      await saveCharacter(sample);
      storedCharacters = [sample];
    }
    const settings = await getSettings();
    const selected = storedCharacters.find((character) => character.id === settings.activeCharacterId) ?? storedCharacters[0];
    setCharacters(storedCharacters.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    const nextModel = settings.model ?? DEFAULT_MODEL_CONFIG;
    contextLimitRef.current = nextModel.contextLimit;
    setModelConfig(nextModel);
    await selectCharacter(selected);
    setReady(true);
  }, [selectCharacter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      reloadAll().catch((error: unknown) => {
        setRuntimeError(error instanceof Error ? error.message : "初始化本地数据失败。");
        setReady(true);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reloadAll]);

  async function persistMessages(nextMessages: StoredMessage[]) {
    if (!conversation) return;
    const nextConversation = { ...conversation, messages: nextMessages, updatedAt: new Date().toISOString() };
    setConversation(nextConversation);
    await saveConversation(nextConversation);
  }

  async function sendMessage(content: string) {
    const character = activeCharacter;
    if (!character || !conversation || streaming) return;
    setRuntimeError("");
    if (!modelConfig.baseUrl.trim() || !modelConfig.model.trim()) {
      setRuntimeError("请先在设置中填写 API 地址与模型 ID。");
      return;
    }

    const userMessage: StoredMessage = {
      id: createId("message"),
      role: "user",
      content: content.trim(),
      createdAt: new Date().toISOString(),
      status: "complete",
    };
    const assistantMessage: StoredMessage = {
      id: createId("message"),
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      status: "streaming",
    };
    const requestMessages = [...messages, userMessage];
    const visibleMessages = [...requestMessages, assistantMessage];
    setMessages(visibleMessages);
    await persistMessages(visibleMessages);

    const compiled = compileContext(character, requestMessages, modelConfig.contextLimit);
    setContextReport(compiled.report);
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    let assistantText = "";

    try {
      await streamChatCompletion({
        config: modelConfig,
        apiKey,
        messages: compiled.messages,
        signal: controller.signal,
        onDelta: (delta) => {
          assistantText += delta;
          setMessages((current) => current.map((message) => message.id === assistantMessage.id
            ? { ...message, content: assistantText }
            : message));
        },
      });
      if (!assistantText.trim()) throw new Error("模型没有返回文本内容。");
      const completed = visibleMessages.map((message) => message.id === assistantMessage.id
        ? { ...message, content: assistantText, status: "complete" as const }
        : message);
      setMessages(completed);
      await persistMessages(completed);
      refreshContext(character, completed);
    } catch (error) {
      const stopped = error instanceof DOMException && error.name === "AbortError";
      const failed = visibleMessages.map((message) => message.id === assistantMessage.id
        ? { ...message, content: assistantText || (stopped ? "" : "生成失败"), status: stopped ? "stopped" as const : "error" as const }
        : message);
      setMessages(failed);
      await persistMessages(failed);
      if (!stopped) {
        const message = error instanceof Error ? error.message : "模型请求失败。";
        setRuntimeError(message.includes("fetch") ? "无法连接模型接口。请检查地址、网络和浏览器跨域设置。" : message);
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  }

  async function parseImport(file: File) {
    setImportError("");
    setImportPreview(null);
    try {
      setImportPreview(await parseCharacterFile(file));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "无法解析角色卡。");
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    await saveCharacter(importPreview.character);
    const nextCharacters = [importPreview.character, ...characters];
    setCharacters(nextCharacters);
    setImportPreview(null);
    await selectCharacter(importPreview.character);
  }

  async function saveModel() {
    const settings = await getSettings();
    await saveSettings({ ...settings, model: modelConfig, updatedAt: new Date().toISOString() });
    setRuntimeError("");
  }

  async function testConnection() {
    setConnectionStatus("testing");
    setRuntimeError("");
    try {
      const models = await testModelConnection(modelConfig, apiKey);
      setAvailableModels(models);
      setConnectionStatus("connected");
      await saveModel();
    } catch (error) {
      setConnectionStatus("error");
      setRuntimeError(error instanceof Error ? error.message : "连接测试失败。");
    }
  }

  async function downloadBackup() {
    const backup = await createBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lunemir-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function restoreFromBackup(file: File) {
    setRuntimeError("");
    try {
      await restoreBackup(file);
      await reloadAll();
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "恢复备份失败。");
    }
  }

  return {
    ready,
    characters,
    activeCharacter,
    messages,
    streaming,
    runtimeError,
    clearRuntimeError: () => setRuntimeError(""),
    contextReport,
    modelConfig,
    setModelConfig,
    apiKey,
    setApiKey,
    connectionStatus,
    availableModels,
    importPreview,
    importError,
    clearImport: () => { setImportPreview(null); setImportError(""); },
    parseImport,
    confirmImport,
    selectCharacter,
    sendMessage,
    stopGeneration: () => abortRef.current?.abort(),
    saveModel,
    testConnection,
    downloadBackup,
    restoreFromBackup,
  };
}
