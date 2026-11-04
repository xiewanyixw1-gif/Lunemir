"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseContentFile } from "../../lib/lunemir/content-import";
import { compileContext } from "../../lib/lunemir/context";
import { createDefaultPersona, createId, createSampleCharacter, DEFAULT_APPEARANCE, DEFAULT_MODEL_CONFIG } from "../../lib/lunemir/defaults";
import { generateChatCompletion, streamChatCompletion, testModelConnection } from "../../lib/lunemir/model-client";
import { createStoryEvent, isDuplicatePhoneEvent, parsePhoneMessageProposal } from "../../lib/lunemir/story-events";
import {
  createBackup,
  deleteCharacter as removeStoredCharacter,
  deleteConversation as removeStoredConversation,
  deleteStoryEvents,
  getSettings,
  listCharacters,
  listConversations,
  listLorebooks,
  listPersonas,
  listPresets,
  listStoryEvents,
  restoreBackup,
  saveCharacter,
  saveConversation,
  saveLorebook,
  savePersona,
  savePreset,
  saveSettings,
  saveStoryEvent,
} from "../../lib/lunemir/storage";
import type {
  AppearanceSettings,
  CharacterRecord,
  CharacterEditorValues,
  ContentImportPreview,
  ContextReport,
  ConversationRecord,
  LorebookRecord,
  ModelConfig,
  PersonaRecord,
  PresetRecord,
  StoredMessage,
  StoryEvent,
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

async function createConversationRecord(
  character: CharacterRecord,
  options: { title?: string; messages?: StoredMessage[]; parentConversationId?: string; branchedFromMessageId?: string } = {},
) {
  const now = new Date().toISOString();
  const conversation: ConversationRecord = {
    id: createId("conversation"),
    schemaVersion: 1,
    characterId: character.id,
    title: options.title || character.firstMessage.slice(0, 28) || `与 ${character.name} 的对话`,
    messages: options.messages ?? initialMessage(character),
    parentConversationId: options.parentConversationId,
    branchedFromMessageId: options.branchedFromMessageId,
    checkpoints: [],
    memories: [],
    createdAt: now,
    updatedAt: now,
  };
  await saveConversation(conversation);
  return conversation;
}

function normalizeAppearance(value?: Partial<AppearanceSettings>): AppearanceSettings {
  const theme = value?.theme === "aurora" || value?.theme === "rose" ? value.theme : "moon";
  const glassMode = value?.glassMode === "messages" ? "messages" : "full";
  const backgroundMode = value?.backgroundMode === "gradient" || value?.backgroundMode === "custom"
    ? value.backgroundMode
    : "character";
  const numberOr = (candidate: number | undefined, fallback: number) => Number.isFinite(candidate) ? Number(candidate) : fallback;
  return {
    theme,
    blur: Math.min(36, Math.max(4, numberOr(value?.blur, DEFAULT_APPEARANCE.blur))),
    opacity: Math.min(92, Math.max(25, numberOr(value?.opacity, DEFAULT_APPEARANCE.opacity))),
    radius: Math.min(36, Math.max(10, numberOr(value?.radius, DEFAULT_APPEARANCE.radius))),
    glassMode,
    backgroundMode,
    backgroundImage: typeof value?.backgroundImage === "string" && value.backgroundImage.startsWith("data:image/")
      ? value.backgroundImage
      : undefined,
  };
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
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [conversation, setConversation] = useState<ConversationRecord | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [storyEvents, setStoryEvents] = useState<StoryEvent[]>([]);
  const [phoneEventStatus, setPhoneEventStatus] = useState<"idle" | "checking" | "linked" | "error">("idle");
  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const [apiKey, setApiKey] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "connected" | "error">("idle");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<ContentImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [runtimeError, setRuntimeError] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [contextReport, setContextReport] = useState<ContextReport | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const storyEventsRef = useRef<StoryEvent[]>([]);
  const phoneEventCheckRef = useRef(false);
  const contextLimitRef = useRef(DEFAULT_MODEL_CONFIG.contextLimit);
  const contextResourcesRef = useRef<{
    persona: PersonaRecord | null;
    preset: PresetRecord | null;
    externalLoreEntries: LorebookRecord["entries"];
    memories: string[];
    storyEvents: StoryEvent[];
  }>({ persona: null, preset: null, externalLoreEntries: [], memories: [], storyEvents: [] });
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
    const settings = await getSettings();
    let characterConversations = (await listConversations(character.id))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    if (characterConversations.length === 0) {
      characterConversations = [await createConversationRecord(character)];
    }
    const nextConversation = characterConversations.find((item) => item.id === settings.activeConversationIds?.[character.id])
      ?? characterConversations[0];
    const nextStoryEvents = await listStoryEvents(nextConversation.id);
    setConversations(characterConversations);
    setConversation(nextConversation);
    setMessages(nextConversation.messages);
    setStoryEvents(nextStoryEvents);
    setPhoneEventStatus("idle");
    storyEventsRef.current = nextStoryEvents;
    contextResourcesRef.current.memories = (nextConversation.memories ?? [])
      .filter((memory) => memory.status === "approved")
      .map((memory) => memory.content);
    contextResourcesRef.current.storyEvents = nextStoryEvents;
    refreshContext(character, nextConversation.messages);
    await saveSettings({
      ...settings,
      activeCharacterId: character.id,
      activeConversationIds: { ...(settings.activeConversationIds ?? {}), [character.id]: nextConversation.id },
      updatedAt: new Date().toISOString(),
    });
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
      memories: [],
      storyEvents: [],
    };
    const nextModel = settings.model ?? DEFAULT_MODEL_CONFIG;
    setAppearance(normalizeAppearance(settings.appearance));
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
    setConversations((current) => current.map((item) => item.id === nextConversation.id ? nextConversation : item));
    await saveConversation(nextConversation);
  }

  async function activateConversationRecord(nextConversation: ConversationRecord) {
    const character = activeCharacter;
    if (!character) return;
    setConversation(nextConversation);
    setMessages(nextConversation.messages);
    const nextStoryEvents = await listStoryEvents(nextConversation.id);
    setStoryEvents(nextStoryEvents);
    setPhoneEventStatus("idle");
    storyEventsRef.current = nextStoryEvents;
    contextResourcesRef.current.memories = (nextConversation.memories ?? [])
      .filter((memory) => memory.status === "approved")
      .map((memory) => memory.content);
    contextResourcesRef.current.storyEvents = nextStoryEvents;
    refreshContext(character, nextConversation.messages);
    const settings = await getSettings();
    await saveSettings({
      ...settings,
      activeConversationIds: { ...(settings.activeConversationIds ?? {}), [character.id]: nextConversation.id },
      updatedAt: new Date().toISOString(),
    });
  }

  async function selectConversation(conversationId: string) {
    if (streaming) return;
    const nextConversation = conversations.find((item) => item.id === conversationId);
    if (nextConversation) await activateConversationRecord(nextConversation);
  }

  async function saveCharacterProfile(characterId: string | undefined, values: CharacterEditorValues) {
    const existing = characterId ? characters.find((character) => character.id === characterId) : undefined;
    const now = new Date().toISOString();
    const normalized: CharacterEditorValues = {
      ...values,
      name: values.name.trim(),
      nickname: values.nickname.trim(),
      tags: values.tags.map((tag) => tag.trim()).filter(Boolean),
      creator: values.creator.trim(),
      characterVersion: values.characterVersion.trim() || "1.0",
    };
    if (!normalized.name) {
      setRuntimeError("角色名称不能为空。");
      return null;
    }
    const character: CharacterRecord = existing
      ? { ...existing, ...normalized, updatedAt: now }
      : {
          id: createId("character"),
          schemaVersion: 1,
          spec: "v2",
          specVersion: "2.0",
          sourceFormat: "lunemir-editor",
          sourceName: "Created in Lunemir",
          ...normalized,
          alternateGreetings: [],
          lorebookName: "",
          lorebookEntries: [],
          extensions: {},
          raw: {},
          createdAt: now,
          updatedAt: now,
        };
    await saveCharacter(character);
    const nextCharacters = existing
      ? characters.map((item) => item.id === character.id ? character : item)
      : [character, ...characters];
    setCharacters(nextCharacters);
    if (activeCharacter?.id === character.id) refreshContext(character, messages);
    return character;
  }

  async function duplicateCharacter(characterId: string) {
    const source = characters.find((character) => character.id === characterId);
    if (!source) return null;
    const now = new Date().toISOString();
    const duplicate: CharacterRecord = {
      ...source,
      id: createId("character"),
      name: `${source.name} · 副本`,
      sourceFormat: "lunemir-copy",
      sourceName: source.sourceName || source.name,
      characterVersion: source.characterVersion || "1.0",
      tags: [...source.tags],
      alternateGreetings: [...source.alternateGreetings],
      lorebookEntries: source.lorebookEntries.map((entry) => ({
        ...entry,
        keys: [...entry.keys],
        secondaryKeys: [...entry.secondaryKeys],
        extensions: { ...entry.extensions },
      })),
      raw: { ...source.raw },
      extensions: { ...source.extensions },
      createdAt: now,
      updatedAt: now,
    };
    await saveCharacter(duplicate);
    setCharacters((items) => [duplicate, ...items]);
    return duplicate;
  }

  async function deleteCharacterProfile(characterId: string) {
    if (characters.length <= 1) {
      setRuntimeError("至少需要保留一个角色。");
      return false;
    }
    const target = characters.find((character) => character.id === characterId);
    if (!target) return false;
    const targetConversations = await listConversations(characterId);
    await Promise.all(targetConversations.map(async (item) => {
      await deleteStoryEvents(item.id);
      await removeStoredConversation(item.id);
    }));
    await removeStoredCharacter(characterId);
    const remaining = characters.filter((character) => character.id !== characterId);
    setCharacters(remaining);
    const settings = await getSettings();
    const activeConversationIds = { ...(settings.activeConversationIds ?? {}) };
    delete activeConversationIds[characterId];
    await saveSettings({
      ...settings,
      activeCharacterId: settings.activeCharacterId === characterId ? remaining[0].id : settings.activeCharacterId,
      activeConversationIds,
      updatedAt: new Date().toISOString(),
    });
    if (activeCharacter?.id === characterId) await selectCharacter(remaining[0]);
    return true;
  }

  function downloadCharacter(characterId: string) {
    const character = characters.find((item) => item.id === characterId);
    if (!character) return;
    const existingLunemirExtensions = character.extensions.lunemir;
    const lunemirExtensions = existingLunemirExtensions && typeof existingLunemirExtensions === "object" && !Array.isArray(existingLunemirExtensions)
      ? existingLunemirExtensions as Record<string, unknown>
      : {};
    const payload = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: character.name,
        description: character.description,
        personality: character.personality,
        scenario: character.scenario,
        first_mes: character.firstMessage,
        mes_example: character.exampleMessages,
        creator_notes: character.creatorNotes,
        system_prompt: character.systemPrompt,
        post_history_instructions: character.postHistoryInstructions,
        alternate_greetings: character.alternateGreetings,
        tags: character.tags,
        creator: character.creator,
        character_version: character.characterVersion,
        extensions: {
          ...character.extensions,
          lunemir: {
            ...lunemirExtensions,
            ...(character.avatarDataUrl ? { avatar_data_url: character.avatarDataUrl } : {}),
          },
        },
        character_book: character.lorebookEntries.length > 0 ? {
          name: character.lorebookName || `${character.name} Lorebook`,
          entries: character.lorebookEntries.map((entry) => ({
            keys: entry.keys,
            secondary_keys: entry.secondaryKeys,
            content: entry.content,
            enabled: entry.enabled,
            constant: entry.constant,
            selective: entry.selective,
            insertion_order: entry.insertionOrder,
            extensions: { ...entry.extensions, priority: entry.priority },
          })),
        } : undefined,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${character.name.replace(/[\\/:*?"<>|]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function createNewConversation() {
    const character = activeCharacter;
    if (!character || streaming) return;
    const nextConversation = await createConversationRecord(character, { title: `新会话 · ${conversations.length + 1}` });
    setConversations((current) => [nextConversation, ...current]);
    await activateConversationRecord(nextConversation);
  }

  async function branchConversation(messageId: string) {
    const character = activeCharacter;
    if (!character || !conversation || streaming) return;
    const messageIndex = messages.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) return;
    const branchMessages = messages.slice(0, messageIndex + 1).map((message) => ({ ...message }));
    const nextConversation = await createConversationRecord(character, {
      title: `${conversation.title} · 分支`,
      messages: branchMessages,
      parentConversationId: conversation.id,
      branchedFromMessageId: messageId,
    });
    setConversations((current) => [nextConversation, ...current]);
    await activateConversationRecord(nextConversation);
  }

  async function renameConversation(conversationId: string, title: string) {
    const current = conversations.find((item) => item.id === conversationId);
    if (!current || !title.trim()) return;
    const nextConversation = { ...current, title: title.trim(), updatedAt: new Date().toISOString() };
    setConversations((items) => items.map((item) => item.id === conversationId ? nextConversation : item));
    if (conversation?.id === conversationId) setConversation(nextConversation);
    await saveConversation(nextConversation);
  }

  async function deleteConversation(conversationId: string) {
    const character = activeCharacter;
    if (!character || streaming) return;
    await deleteStoryEvents(conversationId);
    await removeStoredConversation(conversationId);
    let remaining = conversations.filter((item) => item.id !== conversationId);
    if (remaining.length === 0) remaining = [await createConversationRecord(character, { title: "新的故事" })];
    setConversations(remaining);
    if (conversation?.id === conversationId) await activateConversationRecord(remaining[0]);
  }

  async function createCheckpoint(label?: string) {
    if (!conversation || streaming) return;
    const checkpoints = conversation.checkpoints ?? [];
    const nextConversation: ConversationRecord = {
      ...conversation,
      checkpoints: [...checkpoints, {
        id: createId("checkpoint"),
        label: label?.trim() || `章节点 ${checkpoints.length + 1}`,
        messageId: messages.at(-1)?.id,
        createdAt: new Date().toISOString(),
      }],
      updatedAt: new Date().toISOString(),
    };
    setConversation(nextConversation);
    setConversations((items) => items.map((item) => item.id === nextConversation.id ? nextConversation : item));
    await saveConversation(nextConversation);
  }

  async function addMemoryCandidate(messageId: string) {
    if (!conversation || streaming) return;
    const source = messages.find((message) => message.id === messageId);
    if (!source || (conversation.memories ?? []).some((memory) => memory.sourceMessageId === messageId)) return;
    const nextConversation: ConversationRecord = {
      ...conversation,
      memories: [...(conversation.memories ?? []), {
        id: createId("memory"),
        content: source.content.trim(),
        sourceMessageId: messageId,
        status: "candidate",
        createdAt: new Date().toISOString(),
      }],
      updatedAt: new Date().toISOString(),
    };
    setConversation(nextConversation);
    setConversations((items) => items.map((item) => item.id === nextConversation.id ? nextConversation : item));
    await saveConversation(nextConversation);
  }

  async function setMemoryStatus(memoryId: string, status: "approved" | "remove") {
    const character = activeCharacter;
    if (!character || !conversation || streaming) return;
    const memories = status === "remove"
      ? (conversation.memories ?? []).filter((memory) => memory.id !== memoryId)
      : (conversation.memories ?? []).map((memory) => memory.id === memoryId ? { ...memory, status: "approved" as const } : memory);
    const nextConversation = { ...conversation, memories, updatedAt: new Date().toISOString() };
    setConversation(nextConversation);
    setConversations((items) => items.map((item) => item.id === nextConversation.id ? nextConversation : item));
    contextResourcesRef.current.memories = memories.filter((memory) => memory.status === "approved").map((memory) => memory.content);
    refreshContext(character, messages);
    await saveConversation(nextConversation);
  }

  async function commitStoryEvent(event: StoryEvent, contextMessages: StoredMessage[] = messages) {
    const character = activeCharacter;
    if (!character) return;
    await saveStoryEvent(event);
    const nextEvents = [...storyEventsRef.current, event]
      .sort((left, right) => left.storyTime.localeCompare(right.storyTime) || left.createdAt.localeCompare(right.createdAt));
    storyEventsRef.current = nextEvents;
    setStoryEvents(nextEvents);
    contextResourcesRef.current.storyEvents = nextEvents;
    refreshContext(character, contextMessages);
  }

  async function requestPhoneEvent(contextMessages: StoredMessage[] = messages, force = true) {
    const character = activeCharacter;
    const persona = activePersona;
    const currentStory = conversation;
    if (!character || !persona || !currentStory || phoneEventCheckRef.current || !modelIsReady()) return;
    const latestIncoming = [...storyEventsRef.current].reverse().find((event) => event.eventType === "phone_message_received" && event.actorId === character.id);
    if (!force && latestIncoming && Date.now() - Date.parse(latestIncoming.createdAt) < 30 * 60 * 1000) return;

    phoneEventCheckRef.current = true;
    setPhoneEventStatus("checking");
    const controller = new AbortController();
    const transcript = contextMessages.slice(-10).map((message) => `${message.role === "assistant" ? character.name : persona.name}：${message.content}`).join("\n");
    const phoneHistory = storyEventsRef.current.slice(-8).map((event) => `${event.actorId === character.id ? character.name : persona.name}：${event.content}`).join("\n");
    const decisionRule = force
      ? "本次是用户主动推进手机剧情，请生成一条符合当前状态的角色手机消息，并将 shouldSend 设为 true。"
      : "只有当角色在当前剧情状态下确实有理由额外联系用户时才将 shouldSend 设为 true；不要为了制造通知而强行发送。";
    try {
      const raw = await generateChatCompletion({
        config: modelConfig,
        apiKey,
        signal: controller.signal,
        maxTokens: 220,
        temperature: Math.min(modelConfig.temperature, 0.72),
        messages: [
          {
            role: "system",
            content: `你是剧情事件规划器，不负责续写主聊天。${decisionRule}\n角色：${character.name}\n角色设定：${character.description}\n性格：${character.personality}\n当前场景：${character.scenario}\n用户人设：${persona.name}，${persona.description}\n只输出严格 JSON，不要 Markdown：{"shouldSend":true或false,"content":"手机消息正文","reason":"触发理由"}。消息必须像即时通讯，保持角色语言习惯，不替用户行动，不引入未发生的事实，正文最多 600 字。`,
          },
          { role: "user", content: `最近主剧情：\n${transcript || "尚无主剧情消息"}\n\n已确认手机通信：\n${phoneHistory || "尚无手机消息"}` },
        ],
      });
      const proposal = parsePhoneMessageProposal(raw);
      if (!proposal.shouldSend) {
        setPhoneEventStatus("idle");
        return;
      }
      const event = createStoryEvent({
        storyId: currentStory.id,
        eventType: "phone_message_received",
        actorId: character.id,
        targetId: persona.id,
        content: proposal.content,
        source: "ai",
      });
      if (isDuplicatePhoneEvent(storyEventsRef.current, event)) {
        setPhoneEventStatus("idle");
        return;
      }
      await commitStoryEvent(event, contextMessages);
      setPhoneEventStatus("linked");
    } catch {
      setPhoneEventStatus("error");
    } finally {
      phoneEventCheckRef.current = false;
    }
  }

  async function sendPhoneMessage(content: string) {
    const character = activeCharacter;
    const persona = activePersona;
    if (!character || !persona || !conversation || !content.trim()) return;
    const latestIncoming = [...storyEventsRef.current].reverse().find((event) => event.eventType === "phone_message_received");
    const event = createStoryEvent({
      storyId: conversation.id,
      eventType: "phone_message_sent",
      actorId: persona.id,
      targetId: character.id,
      content,
      source: "user",
      replyToEventId: latestIncoming?.id,
    });
    await commitStoryEvent(event);
    setPhoneEventStatus("linked");
  }

  async function markPhoneEventsRead() {
    const now = new Date().toISOString();
    const changed = storyEventsRef.current.filter((event) => event.eventType === "phone_message_received" && !event.readAt);
    if (changed.length === 0) return;
    const changedIds = new Set(changed.map((event) => event.id));
    const nextEvents = storyEventsRef.current.map((event) => changedIds.has(event.id) ? { ...event, readAt: now } : event);
    await Promise.all(nextEvents.filter((event) => changedIds.has(event.id)).map((event) => saveStoryEvent(event)));
    storyEventsRef.current = nextEvents;
    contextResourcesRef.current.storyEvents = nextEvents;
    setStoryEvents(nextEvents);
  }

  function modelIsReady() {
    if (modelConfig.baseUrl.trim() && modelConfig.model.trim()) return true;
    setRuntimeError("请先在设置中填写 API 地址与模型 ID。");
    return false;
  }

  async function generateReply(
    requestMessages: StoredMessage[],
    target: { mode: "new" } | { mode: "replace" | "append"; message: StoredMessage } = { mode: "new" },
  ) {
    const character = activeCharacter;
    if (!character || !conversation || streaming) return;
    setRuntimeError("");
    if (!modelIsReady()) return;
    const sourceMessage = target.mode === "new" ? null : target.message;
    const previousAlternatives = sourceMessage
      ? (sourceMessage.alternatives?.length ? sourceMessage.alternatives : [sourceMessage.content])
      : [];
    const prefix = target.mode === "append" ? target.message.content : "";
    const assistantMessage: StoredMessage = sourceMessage
      ? { ...sourceMessage, content: prefix, status: "streaming" }
      : {
          id: createId("message"),
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
          status: "streaming",
        };
    const visibleMessages = target.mode === "append"
      ? requestMessages.map((message) => message.id === assistantMessage.id ? assistantMessage : message)
      : [...requestMessages, assistantMessage];
    setMessages(visibleMessages);
    await persistMessages(visibleMessages);

    const compiled = compileContext(character, requestMessages, modelConfig.contextLimit, contextResourcesRef.current);
    setContextReport(compiled.report);
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    let assistantText = "";
    let completedForPhoneEvent: StoredMessage[] | null = null;

    try {
      await streamChatCompletion({
        config: modelConfig,
        apiKey,
        messages: target.mode === "append"
          ? [...compiled.messages, { role: "system", content: "请无缝继续上一条角色回复，不要重复已经写出的内容。" }]
          : compiled.messages,
        signal: controller.signal,
        onDelta: (delta) => {
          assistantText += delta;
          setMessages((current) => current.map((message) => message.id === assistantMessage.id
            ? { ...message, content: `${prefix}${assistantText}` }
            : message));
        },
      });
      if (!assistantText.trim()) throw new Error("模型没有返回文本内容。");
      const completedContent = `${prefix}${assistantText}`;
      const completed = visibleMessages.map((message) => message.id === assistantMessage.id
        ? {
            ...message,
            content: completedContent,
            status: "complete" as const,
            ...(target.mode === "replace"
              ? { alternatives: [...previousAlternatives, completedContent], activeAlternative: previousAlternatives.length }
              : target.mode === "append" && message.alternatives?.length
                ? {
                    alternatives: message.alternatives.map((alternative, index) => index === (message.activeAlternative ?? 0) ? completedContent : alternative),
                  }
                : {}),
          }
        : message);
      setMessages(completed);
      await persistMessages(completed);
      refreshContext(character, completed);
      if (target.mode === "new") completedForPhoneEvent = completed;
    } catch (error) {
      const stopped = error instanceof DOMException && error.name === "AbortError";
      const partialContent = `${prefix}${assistantText}`;
      const failed = visibleMessages.map((message) => message.id === assistantMessage.id
        ? target.mode === "replace" && !assistantText
          ? { ...target.message, status: "complete" as const }
          : {
              ...message,
              content: partialContent || (stopped ? "" : "生成失败"),
              status: stopped ? "stopped" as const : "error" as const,
              ...(target.mode === "replace" && assistantText
                ? { alternatives: [...previousAlternatives, partialContent], activeAlternative: previousAlternatives.length }
                : {}),
            }
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
    if (completedForPhoneEvent) void requestPhoneEvent(completedForPhoneEvent, false);
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
    const nextMessages = messages.map((message) => {
      if (message.id !== messageId) return message;
      const nextContent = content.trim();
      const alternatives = message.alternatives?.map((alternative, index) => index === (message.activeAlternative ?? 0) ? nextContent : alternative);
      return { ...message, content: nextContent, alternatives, editedAt: new Date().toISOString(), status: "complete" as const };
    });
    setMessages(nextMessages);
    await persistMessages(nextMessages);
    refreshContext(character, nextMessages);
  }

  async function deleteMessage(messageId: string) {
    const character = activeCharacter;
    if (!character || !conversation || streaming) return;
    const nextMessages = messages.filter((message) => message.id !== messageId);
    const nextConversation: ConversationRecord = {
      ...conversation,
      messages: nextMessages,
      checkpoints: (conversation.checkpoints ?? []).filter((checkpoint) => checkpoint.messageId !== messageId),
      memories: (conversation.memories ?? []).filter((memory) => memory.sourceMessageId !== messageId),
      updatedAt: new Date().toISOString(),
    };
    setMessages(nextMessages);
    setConversation(nextConversation);
    setConversations((items) => items.map((item) => item.id === nextConversation.id ? nextConversation : item));
    contextResourcesRef.current.memories = (nextConversation.memories ?? [])
      .filter((memory) => memory.status === "approved")
      .map((memory) => memory.content);
    await saveConversation(nextConversation);
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
    if (lastMessage?.role === "assistant") {
      await generateReply(requestMessages, { mode: "replace", message: lastMessage });
      return;
    }
    await generateReply(requestMessages);
  }

  async function continueLastReply() {
    if (streaming || !modelIsReady()) return;
    const lastMessage = messages.at(-1);
    if (!lastMessage || lastMessage.role !== "assistant" || !lastMessage.content.trim()) {
      setRuntimeError("需要先有一条角色回复，才能继续生成。");
      return;
    }
    await generateReply(messages, { mode: "append", message: lastMessage });
  }

  async function selectMessageAlternative(messageId: string, alternativeIndex: number) {
    const character = activeCharacter;
    if (!character || streaming) return;
    const nextMessages = messages.map((message) => {
      if (message.id !== messageId || !message.alternatives?.[alternativeIndex]) return message;
      return { ...message, content: message.alternatives[alternativeIndex], activeAlternative: alternativeIndex, status: "complete" as const };
    });
    setMessages(nextMessages);
    await persistMessages(nextMessages);
    refreshContext(character, nextMessages);
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

  async function saveAppearance(nextAppearance: AppearanceSettings) {
    const normalized = normalizeAppearance(nextAppearance);
    setAppearance(normalized);
    const settings = await getSettings();
    await saveSettings({ ...settings, appearance: normalized, updatedAt: new Date().toISOString() });
  }

  function previewAppearance(nextAppearance: AppearanceSettings) {
    setAppearance(normalizeAppearance(nextAppearance));
  }

  async function saveCustomBackground(file: File) {
    if (!file.type.startsWith("image/")) {
      setRuntimeError("请选择 JPG、PNG、WebP 等图片文件。");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setRuntimeError("背景图片不能超过 8 MB。");
      return;
    }
    try {
      const backgroundImage = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("无法读取背景图片。"));
        reader.onerror = () => reject(reader.error ?? new Error("无法读取背景图片。"));
        reader.readAsDataURL(file);
      });
      await saveAppearance({ ...appearance, backgroundMode: "custom", backgroundImage });
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "无法保存背景图片。");
    }
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

  function downloadConversation() {
    const character = activeCharacter;
    if (!character) return;
    const personaName = activePersona?.name ?? "You";
    const lines = [
      `# 与 ${character.name} 的对话`,
      "",
      `> 导出时间：${new Date().toLocaleString("zh-CN")}`,
      "",
      ...messages.flatMap((message) => [
        `## ${message.role === "user" ? personaName : character.name}`,
        "",
        message.content,
        "",
      ]),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lunemir-${character.name.replace(/[\\/:*?"<>|]/g, "-")}-${new Date().toISOString().slice(0, 10)}.md`;
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
    conversations,
    activeConversation: conversation,
    messages,
    storyEvents,
    unreadPhoneEvents: storyEvents.filter((event) => event.eventType === "phone_message_received" && !event.readAt).length,
    phoneEventStatus,
    streaming,
    runtimeError,
    clearRuntimeError: () => setRuntimeError(""),
    contextReport,
    appearance,
    previewAppearance,
    saveAppearance,
    saveCustomBackground,
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
    saveCharacterProfile,
    duplicateCharacter,
    deleteCharacterProfile,
    downloadCharacter,
    selectConversation,
    createNewConversation,
    branchConversation,
    renameConversation,
    deleteConversation,
    createCheckpoint,
    addMemoryCandidate,
    approveMemory: (memoryId: string) => setMemoryStatus(memoryId, "approved"),
    removeMemory: (memoryId: string) => setMemoryStatus(memoryId, "remove"),
    toggleLorebookAssignment,
    savePersonaProfile,
    activatePreset,
    sendMessage,
    editMessage,
    deleteMessage,
    regenerateLastReply,
    continueLastReply,
    selectMessageAlternative,
    requestPhoneEvent,
    sendPhoneMessage,
    markPhoneEventsRead,
    stopGeneration: () => abortRef.current?.abort(),
    saveModel,
    testConnection,
    downloadBackup,
    downloadConversation,
    restoreFromBackup,
  };
}
