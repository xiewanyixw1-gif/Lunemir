"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseContentFile } from "../../lib/lunemir/content-import";
import { compileContext } from "../../lib/lunemir/context";
import { createDefaultPersona, createId, createSampleCharacter, DEFAULT_MODEL_CONFIG } from "../../lib/lunemir/defaults";
import { streamChatCompletion, testModelConnection } from "../../lib/lunemir/model-client";
import {
  createBackup,
  getConversation,
  getSettings,
  listCharacters,
  listLorebooks,
  listPersonas,
  listPresets,
  restoreBackup,
  saveCharacter,
  saveConversation,
  saveLorebook,
  savePersona,
  savePreset,
  saveSettings,
} from "../../lib/lunemir/storage";
import type {
  CharacterRecord,
  ContentImportPreview,
  ContextReport,
  ConversationRecord,
  LorebookRecord,
  ModelConfig,
  PersonaRecord,
  PresetRecord,
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
  const [lorebooks, setLorebooks] = useState<LorebookRecord[]>([]);
  const [personas, setPersonas] = useState<PersonaRecord[]>([]);
  const [presets, setPresets] = useState<PresetRecord[]>([]);
  const [activeCharacterId, setActiveCharacterId] = useState("");
  const [activePersonaId, setActivePersonaId] = useState("");
  const [activePresetId, setActivePresetId] = useState("");
  const [lorebookAssignments, setLorebookAssignments] = useState<Record<string, string[]>>({});
  const [conversation, setConversation] = useState<ConversationRecord | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const [apiKey, setApiKey] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "connected" | "error">("idle");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<ContentImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [runtimeError, setRuntimeError] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [contextReport, setContextReport] = useState<ContextReport | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const contextLimitRef = useRef(DEFAULT_MODEL_CONFIG.contextLimit);
  const contextResourcesRef = useRef<{
    persona: PersonaRecord | null;
    preset: PresetRecord | null;
    externalLoreEntries: LorebookRecord["entries"];
  }>({ persona: null, preset: null, externalLoreEntries: [] });
  const contentLibraryRef = useRef<{
    lorebooks: LorebookRecord[];
    assignments: Record<string, string[]>;
  }>({ lorebooks: [], assignments: {} });

  const activeCharacter = useMemo(
    () => characters.find((character) => character.id === activeCharacterId) ?? characters[0] ?? null,
    [activeCharacterId, characters],
  );
  const activePersona = useMemo(
    () => personas.find((persona) => persona.id === activePersonaId) ?? personas[0] ?? null,
    [activePersonaId, personas],
  );
  const activePreset = useMemo(
    () => presets.find((preset) => preset.id === activePresetId) ?? null,
    [activePresetId, presets],
  );
  const activeLorebooks = useMemo(() => {
    const assigned = new Set(lorebookAssignments[activeCharacter?.id ?? ""] ?? []);
    return lorebooks.filter((lorebook) => assigned.has(lorebook.id));
  }, [activeCharacter?.id, lorebookAssignments, lorebooks]);

  useEffect(() => {
    contextLimitRef.current = modelConfig.contextLimit;
  }, [modelConfig.contextLimit]);

  useEffect(() => {
    contextResourcesRef.current.persona = activePersona;
    contextResourcesRef.current.preset = activePreset;
    contextResourcesRef.current.externalLoreEntries = activeLorebooks.flatMap((lorebook) => lorebook.entries);
  }, [activeLorebooks, activePersona, activePreset]);

  const refreshContext = useCallback((character: CharacterRecord, nextMessages: StoredMessage[]) => {
    setContextReport(compileContext(character, nextMessages, contextLimitRef.current, contextResourcesRef.current).report);
  }, []);

  const selectCharacter = useCallback(async (character: CharacterRecord) => {
    setActiveCharacterId(character.id);
    const assigned = new Set(contentLibraryRef.current.assignments[character.id] ?? []);
    contextResourcesRef.current.externalLoreEntries = contentLibraryRef.current.lorebooks
      .filter((lorebook) => assigned.has(lorebook.id))
      .flatMap((lorebook) => lorebook.entries);
    const nextConversation = await loadOrCreateConversation(character);
    setConversation(nextConversation);
    setMessages(nextConversation.messages);
    refreshContext(character, nextConversation.messages);
    const settings = await getSettings();
    await saveSettings({ ...settings, activeCharacterId: character.id, updatedAt: new Date().toISOString() });
  }, [refreshContext]);

  const reloadAll = useCallback(async () => {
    const [storedCharacterRecords, storedLorebooks, storedPersonaRecords, storedPresets, settings] = await Promise.all([
      listCharacters(),
      listLorebooks(),
      listPersonas(),
      listPresets(),
      getSettings(),
    ]);
    let storedCharacters = storedCharacterRecords;
    if (storedCharacters.length === 0) {
      const sample = createSampleCharacter();
      await saveCharacter(sample);
      storedCharacters = [sample];
    }
    let storedPersonas = storedPersonaRecords;
    if (storedPersonas.length === 0) {
      const persona = createDefaultPersona();
      await savePersona(persona);
      storedPersonas = [persona];
    }
    const selected = storedCharacters.find((character) => character.id === settings.activeCharacterId) ?? storedCharacters[0];
    const selectedPersona = storedPersonas.find((persona) => persona.id === settings.activePersonaId) ?? storedPersonas[0];
    const selectedPreset = storedPresets.find((preset) => preset.id === settings.activePresetId) ?? null;
    const assignments = settings.lorebookAssignments ?? {};
    setCharacters(storedCharacters.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    setLorebooks(storedLorebooks);
    setPersonas(storedPersonas);
    setPresets(storedPresets);
    setActivePersonaId(selectedPersona.id);
    setActivePresetId(selectedPreset?.id ?? "");
    setLorebookAssignments(assignments);
    contentLibraryRef.current = { lorebooks: storedLorebooks, assignments };
    contextResourcesRef.current = {
      persona: selectedPersona,
      preset: selectedPreset,
      externalLoreEntries: storedLorebooks
        .filter((lorebook) => (assignments[selected.id] ?? []).includes(lorebook.id))
        .flatMap((lorebook) => lorebook.entries),
    };
    const nextModel = settings.model ?? DEFAULT_MODEL_CONFIG;
    contextLimitRef.current = nextModel.contextLimit;
    setModelConfig(nextModel);
    if (settings.activePersonaId !== selectedPersona.id) {
      await saveSettings({ ...settings, activePersonaId: selectedPersona.id, updatedAt: new Date().toISOString() });
    }
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

  function modelIsReady() {
    if (modelConfig.baseUrl.trim() && modelConfig.model.trim()) return true;
    setRuntimeError("请先在设置中填写 API 地址与模型 ID。");
    return false;
  }

  async function generateReply(requestMessages: StoredMessage[]) {
    const character = activeCharacter;
    if (!character || !conversation || streaming) return;
    setRuntimeError("");
    if (!modelIsReady()) return;
    const assistantMessage: StoredMessage = {
      id: createId("message"),
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      status: "streaming",
    };
    const visibleMessages = [...requestMessages, assistantMessage];
    setMessages(visibleMessages);
    await persistMessages(visibleMessages);

    const compiled = compileContext(character, requestMessages, modelConfig.contextLimit, contextResourcesRef.current);
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
      refreshContext(character, failed);
      if (!stopped) {
        const message = error instanceof Error ? error.message : "模型请求失败。";
        setRuntimeError(message.includes("fetch") ? "无法连接模型接口。请检查地址、网络和浏览器跨域设置。" : message);
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  }

  async function sendMessage(content: string) {
    if (streaming || !content.trim() || !modelIsReady()) return;
    const userMessage: StoredMessage = {
      id: createId("message"),
      role: "user",
      content: content.trim(),
      createdAt: new Date().toISOString(),
      status: "complete",
    };
    await generateReply([...messages, userMessage]);
  }

  async function editMessage(messageId: string, content: string) {
    const character = activeCharacter;
    if (!character || streaming || !content.trim()) return;
    const nextMessages = messages.map((message) => message.id === messageId
      ? { ...message, content: content.trim(), editedAt: new Date().toISOString(), status: "complete" as const }
      : message);
    setMessages(nextMessages);
    await persistMessages(nextMessages);
    refreshContext(character, nextMessages);
  }

  async function regenerateLastReply() {
    if (streaming || !modelIsReady()) return;
    const lastMessage = messages.at(-1);
    const requestMessages = lastMessage?.role === "assistant" ? messages.slice(0, -1) : messages;
    if (!requestMessages.some((message) => message.role === "user")) {
      setRuntimeError("发送一条用户消息后才能重新生成回复。");
      return;
    }
    await generateReply(requestMessages);
  }

  async function parseImport(file: File) {
    setImportError("");
    setImportPreview(null);
    try {
      setImportPreview(await parseContentFile(file));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "无法解析导入内容。");
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    setRuntimeError("");
    try {
      if (importPreview.kind === "character") {
        await saveCharacter(importPreview.record);
        setCharacters([importPreview.record, ...characters]);
        await selectCharacter(importPreview.record);
      }
      if (importPreview.kind === "lorebook") {
        await saveLorebook(importPreview.record);
        const nextLorebooks = [importPreview.record, ...lorebooks];
        setLorebooks(nextLorebooks);
        const characterId = activeCharacter?.id;
        const nextAssignments = characterId
          ? { ...lorebookAssignments, [characterId]: [...new Set([...(lorebookAssignments[characterId] ?? []), importPreview.record.id])] }
          : lorebookAssignments;
        setLorebookAssignments(nextAssignments);
        contentLibraryRef.current = { lorebooks: nextLorebooks, assignments: nextAssignments };
        contextResourcesRef.current.externalLoreEntries = nextLorebooks
          .filter((lorebook) => (nextAssignments[characterId ?? ""] ?? []).includes(lorebook.id))
          .flatMap((lorebook) => lorebook.entries);
        const settings = await getSettings();
        await saveSettings({ ...settings, lorebookAssignments: nextAssignments, updatedAt: new Date().toISOString() });
        if (activeCharacter) refreshContext(activeCharacter, messages);
      }
      if (importPreview.kind === "preset") {
        await savePreset(importPreview.record);
        setPresets([importPreview.record, ...presets]);
        setActivePresetId(importPreview.record.id);
        contextResourcesRef.current.preset = importPreview.record;
        const nextModel = { ...modelConfig, ...importPreview.record.modelPatch };
        contextLimitRef.current = nextModel.contextLimit;
        setModelConfig(nextModel);
        const settings = await getSettings();
        await saveSettings({
          ...settings,
          activePresetId: importPreview.record.id,
          model: nextModel,
          updatedAt: new Date().toISOString(),
        });
        if (activeCharacter) refreshContext(activeCharacter, messages);
      }
      setImportPreview(null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "导入内容保存失败。");
    }
  }

  async function toggleLorebookAssignment(lorebookId: string) {
    const character = activeCharacter;
    if (!character) return;
    const current = lorebookAssignments[character.id] ?? [];
    const nextIds = current.includes(lorebookId)
      ? current.filter((id) => id !== lorebookId)
      : [...current, lorebookId];
    const nextAssignments = { ...lorebookAssignments, [character.id]: nextIds };
    setLorebookAssignments(nextAssignments);
    contentLibraryRef.current = { lorebooks, assignments: nextAssignments };
    contextResourcesRef.current.externalLoreEntries = lorebooks
      .filter((lorebook) => nextIds.includes(lorebook.id))
      .flatMap((lorebook) => lorebook.entries);
    const settings = await getSettings();
    await saveSettings({ ...settings, lorebookAssignments: nextAssignments, updatedAt: new Date().toISOString() });
    refreshContext(character, messages);
  }

  async function savePersonaProfile(name: string, description: string) {
    const now = new Date().toISOString();
    const persona: PersonaRecord = activePersona
      ? { ...activePersona, name: name.trim() || "旅行者", description: description.trim(), updatedAt: now }
      : { id: createId("persona"), schemaVersion: 1, name: name.trim() || "旅行者", description: description.trim(), createdAt: now, updatedAt: now };
    await savePersona(persona);
    const nextPersonas = activePersona
      ? personas.map((item) => item.id === persona.id ? persona : item)
      : [persona, ...personas];
    setPersonas(nextPersonas);
    setActivePersonaId(persona.id);
    contextResourcesRef.current.persona = persona;
    const settings = await getSettings();
    await saveSettings({ ...settings, activePersonaId: persona.id, updatedAt: now });
    if (activeCharacter) refreshContext(activeCharacter, messages);
  }

  async function activatePreset(presetId: string) {
    const preset = presets.find((item) => item.id === presetId) ?? null;
    setActivePresetId(preset?.id ?? "");
    contextResourcesRef.current.preset = preset;
    const nextModel = preset ? { ...modelConfig, ...preset.modelPatch } : modelConfig;
    setModelConfig(nextModel);
    contextLimitRef.current = nextModel.contextLimit;
    const settings = await getSettings();
    await saveSettings({ ...settings, activePresetId: preset?.id, model: nextModel, updatedAt: new Date().toISOString() });
    if (activeCharacter) refreshContext(activeCharacter, messages);
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
    lorebooks,
    activeLorebooks,
    personas,
    activePersona,
    presets,
    activePreset,
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
    toggleLorebookAssignment,
    savePersonaProfile,
    activatePreset,
    sendMessage,
    editMessage,
    regenerateLastReply,
    stopGeneration: () => abortRef.current?.abort(),
    saveModel,
    testConnection,
    downloadBackup,
    restoreFromBackup,
  };
}
