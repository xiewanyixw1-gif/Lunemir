"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readCharacterGreetings } from "../../lib/lunemir/character-import";
import { parseContentFile } from "../../lib/lunemir/content-import";
import { compileContext, estimateTokens } from "../../lib/lunemir/context";
import { createDefaultPersona, createId, createSampleCharacter, DEFAULT_APPEARANCE, DEFAULT_IMAGE_MODEL_CONFIG, DEFAULT_MODEL_CONFIG } from "../../lib/lunemir/defaults";
import { generateChatCompletion, generateImage as requestGeneratedImage, streamChatCompletion, testModelConnection } from "../../lib/lunemir/model-client";
import { replaceRoleMacros } from "../../lib/lunemir/macros";
import { normalizeOutputRenderer } from "../../lib/lunemir/output-renderer";
import { createDefaultStoryState, createStoryEvent, isDuplicatePhoneEvent, normalizeStoryState, parsePhoneMessageProposal } from "../../lib/lunemir/story-events";
import {
  createBackup,
  deleteCharacter as removeStoredCharacter,
  deleteConversation as removeStoredConversation,
  deleteLorebook as removeStoredLorebook,
  deletePersona as removeStoredPersona,
  deletePreset as removeStoredPreset,
  deleteProviderApiKey,
  deleteStoryEvents,
  getSettings,
  listAllConversations,
  listAllStoryEvents,
  listCharacters,
  listConversations,
  listLorebooks,
  listPersonas,
  listPresets,
  listProviderApiKeys,
  listStoryEvents,
  restoreBackup,
  saveCharacter,
  saveConversation,
  saveLorebook,
  savePersona,
  savePreset,
  saveProviderApiKey,
  saveSettings,
  saveStoryEvent,
} from "../../lib/lunemir/storage";
import type {
  AppearanceSettings,
  AuthorNote,
  CharacterRecord,
  CharacterEditorValues,
  ContentImportPreview,
  ContextReport,
  ConversationRecord,
  GeneratedImage,
  ImageModelConfig,
  ImageModelProfile,
  LorebookEditorValues,
  LorebookRecord,
  ModelConfig,
  ModelProfile,
  PersonaEditorValues,
  PersonaRecord,
  PresetEditorValues,
  PresetRecord,
  StoredMessage,
  StoryEvent,
  StoryState,
  StorySummary,
} from "../../lib/lunemir/types";

const AUTO_CONTINUATION_LIMIT = 2;
const TRUNCATED_FINISH_REASONS = new Set(["length", "max_tokens", "max_output_tokens"]);

function splitEmbeddedReasoning(value: string) {
  const reasoning: string[] = [];
  let content = value.replace(/<(think|thinking|reasoning)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_match, _tag: string, body: string) => {
    if (body.trim()) reasoning.push(body.trim());
    return "";
  });
  const unfinished = content.match(/<(think|thinking|reasoning)\b[^>]*>([\s\S]*)$/i);
  if (unfinished && !new RegExp(`<\\/${unfinished[1]}\\s*>`, "i").test(unfinished[2])) {
    if (unfinished[2].trim()) reasoning.push(unfinished[2].trim());
    content = content.slice(0, unfinished.index);
  }
  return { content: content.replace(/\n{3,}/g, "\n\n"), reasoning: reasoning.join("\n\n") };
}

function initialMessage(character: CharacterRecord, greeting = character.firstMessage): StoredMessage[] {
  const content = greeting.trim();
  if (!content) return [];
  return [{
    id: createId("message"),
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
    status: "complete",
  }];
}

async function createConversationRecord(
  character: CharacterRecord,
  options: { title?: string; messages?: StoredMessage[]; parentConversationId?: string; branchedFromMessageId?: string; personaName?: string } = {},
) {
  const now = new Date().toISOString();
  const conversation: ConversationRecord = {
    id: createId("conversation"),
    schemaVersion: 1,
    characterId: character.id,
    title: options.title || `与 ${character.nickname || character.name} 的故事`,
    messages: options.messages ?? initialMessage(character),
    parentConversationId: options.parentConversationId,
    branchedFromMessageId: options.branchedFromMessageId,
    checkpoints: [],
    memories: [],
    storyState: createDefaultStoryState(character, now),
    createdAt: now,
    updatedAt: now,
  };
  await saveConversation(conversation);
  return conversation;
}

function normalizeAppearance(value?: Partial<AppearanceSettings>): AppearanceSettings {
  const theme = value?.theme === "aurora" || value?.theme === "rose" ? value.theme : "moon";
  const glassScope = value?.glassScope === "messages"
    || value?.glassScope === "chrome-only"
    || value?.glassScope === "none"
    ? value.glassScope
    : value?.glassScope === "fullscreen"
      ? "fullscreen"
      : value?.glassMode === "messages"
        ? "messages"
        : value?.glassMode === "full"
          ? "fullscreen"
          : DEFAULT_APPEARANCE.glassScope;
  const backgroundMode = value?.backgroundMode === "gradient" || value?.backgroundMode === "custom"
    ? value.backgroundMode
    : "character";
  const numberOr = (candidate: number | undefined, fallback: number) => Number.isFinite(candidate) ? Number(candidate) : fallback;
  const clamp = (candidate: number | undefined, minimum: number, maximum: number, fallback: number) => (
    Math.min(maximum, Math.max(minimum, numberOr(candidate, fallback)))
  );
  const glassBlur = clamp(value?.glassBlur ?? value?.blur, 0, 40, DEFAULT_APPEARANCE.glassBlur);
  const glassOpacity = clamp(value?.glassOpacity ?? value?.opacity, 0, 100, DEFAULT_APPEARANCE.glassOpacity);
  const normalizePosition = (position?: { x: number; y: number }) => (
    position && Number.isFinite(position.x) && Number.isFinite(position.y)
      ? { x: Math.max(0, position.x), y: Math.max(0, position.y) }
      : undefined
  );
  return {
    theme,
    blur: glassBlur,
    opacity: glassOpacity,
    radius: clamp(value?.radius, 10, 36, DEFAULT_APPEARANCE.radius),
    glassMode: glassScope === "messages" ? "messages" : "full",
    backgroundMode,
    backgroundImage: typeof value?.backgroundImage === "string" && value.backgroundImage.startsWith("data:image/")
      ? value.backgroundImage
      : undefined,
    readingStyle: value?.readingStyle === "editorial" || value?.readingStyle === "reader-glass"
      ? value.readingStyle
      : DEFAULT_APPEARANCE.readingStyle,
    messageStyle: value?.messageStyle === "bubble" || value?.messageStyle === "soft-card"
      ? value.messageStyle
      : DEFAULT_APPEARANCE.messageStyle,
    glassScope,
    glassOpacity,
    glassBlur,
    glassBorderOpacity: clamp(value?.glassBorderOpacity, 0, 100, DEFAULT_APPEARANCE.glassBorderOpacity),
    glassHighlight: clamp(value?.glassHighlight, 0, 100, DEFAULT_APPEARANCE.glassHighlight),
    glassShadow: clamp(value?.glassShadow, 0, 100, DEFAULT_APPEARANCE.glassShadow),
    backgroundBrightness: clamp(value?.backgroundBrightness, 20, 150, DEFAULT_APPEARANCE.backgroundBrightness),
    backgroundBlur: clamp(value?.backgroundBlur, 0, 30, DEFAULT_APPEARANCE.backgroundBlur),
    backgroundOverlay: clamp(value?.backgroundOverlay, 0, 100, DEFAULT_APPEARANCE.backgroundOverlay),
    backgroundVignette: clamp(value?.backgroundVignette, 0, 100, DEFAULT_APPEARANCE.backgroundVignette),
    backgroundFit: value?.backgroundFit === "contain" ? "contain" : DEFAULT_APPEARANCE.backgroundFit,
    backgroundScale: clamp(value?.backgroundScale, 70, 180, DEFAULT_APPEARANCE.backgroundScale),
    backgroundPositionX: clamp(value?.backgroundPositionX, 0, 100, DEFAULT_APPEARANCE.backgroundPositionX),
    backgroundPositionY: clamp(value?.backgroundPositionY, 0, 100, DEFAULT_APPEARANCE.backgroundPositionY),
    showCharacterAvatar: value?.showCharacterAvatar ?? DEFAULT_APPEARANCE.showCharacterAvatar,
    showUserAvatar: value?.showUserAvatar ?? DEFAULT_APPEARANCE.showUserAvatar,
    showCharacterName: value?.showCharacterName ?? DEFAULT_APPEARANCE.showCharacterName,
    showUserName: value?.showUserName ?? DEFAULT_APPEARANCE.showUserName,
    showTimestamp: value?.showTimestamp ?? DEFAULT_APPEARANCE.showTimestamp,
    avatarLayout: value?.avatarLayout === "side" ? "side" : DEFAULT_APPEARANCE.avatarLayout,
    avatarShape: value?.avatarShape === "circle" || value?.avatarShape === "square"
      ? value.avatarShape
      : DEFAULT_APPEARANCE.avatarShape,
    avatarSize: clamp(value?.avatarSize, 28, 64, DEFAULT_APPEARANCE.avatarSize),
    avatarGap: clamp(value?.avatarGap, 4, 24, DEFAULT_APPEARANCE.avatarGap),
    fontFamily: value?.fontFamily === "sans" || value?.fontFamily === "system"
      ? value.fontFamily
      : DEFAULT_APPEARANCE.fontFamily,
    fontSize: clamp(value?.fontSize, 14, 24, DEFAULT_APPEARANCE.fontSize),
    fontWeight: clamp(value?.fontWeight, 300, 700, DEFAULT_APPEARANCE.fontWeight),
    lineHeight: clamp(value?.lineHeight, 1.4, 2.4, DEFAULT_APPEARANCE.lineHeight),
    paragraphSpacing: clamp(value?.paragraphSpacing, 0, 32, DEFAULT_APPEARANCE.paragraphSpacing),
    messageMaxWidth: clamp(value?.messageMaxWidth, 520, 1080, DEFAULT_APPEARANCE.messageMaxWidth),
    mobileReadingInset: clamp(value?.mobileReadingInset, 4, 40, DEFAULT_APPEARANCE.mobileReadingInset),
    phoneScale: clamp(value?.phoneScale, 65, 100, DEFAULT_APPEARANCE.phoneScale),
    phoneWallpaper: value?.phoneWallpaper === "aurora" || value?.phoneWallpaper === "rose" || value?.phoneWallpaper === "custom"
      ? value.phoneWallpaper
      : DEFAULT_APPEARANCE.phoneWallpaper,
    phoneWallpaperImage: typeof value?.phoneWallpaperImage === "string" && value.phoneWallpaperImage.startsWith("data:image/")
      ? value.phoneWallpaperImage
      : undefined,
    phoneButtonPosition: normalizePosition(value?.phoneButtonPosition),
    phonePanelPosition: normalizePosition(value?.phonePanelPosition),
  };
}

function normalizeModelConfig(value?: Partial<ModelConfig>): ModelConfig {
  const migrateLegacyLimit = value?.maxTokens === 1200 && !value?.maxTokenParam;
  return {
    ...DEFAULT_MODEL_CONFIG,
    ...value,
    baseUrl: typeof value?.baseUrl === "string" ? value.baseUrl : "",
    modelsPath: typeof value?.modelsPath === "string" && value.modelsPath.trim() ? value.modelsPath : DEFAULT_MODEL_CONFIG.modelsPath,
    chatCompletionsPath: typeof value?.chatCompletionsPath === "string" && value.chatCompletionsPath.trim() ? value.chatCompletionsPath : DEFAULT_MODEL_CONFIG.chatCompletionsPath,
    model: typeof value?.model === "string" ? value.model : "",
    maxTokens: migrateLegacyLimit ? DEFAULT_MODEL_CONFIG.maxTokens : value?.maxTokens ?? DEFAULT_MODEL_CONFIG.maxTokens,
    maxTokenParam: value?.maxTokenParam === "max_completion_tokens" ? "max_completion_tokens" : DEFAULT_MODEL_CONFIG.maxTokenParam,
  };
}

function normalizeImageModelConfig(value?: Partial<ImageModelConfig>): ImageModelConfig {
  return {
    ...DEFAULT_IMAGE_MODEL_CONFIG,
    ...value,
    baseUrl: typeof value?.baseUrl === "string" ? value.baseUrl : "",
    modelsPath: typeof value?.modelsPath === "string" && value.modelsPath.trim() ? value.modelsPath : DEFAULT_IMAGE_MODEL_CONFIG.modelsPath,
    generationsPath: typeof value?.generationsPath === "string" && value.generationsPath.trim() ? value.generationsPath : DEFAULT_IMAGE_MODEL_CONFIG.generationsPath,
    model: typeof value?.model === "string" ? value.model : "",
    size: typeof value?.size === "string" && value.size.trim() ? value.size : DEFAULT_IMAGE_MODEL_CONFIG.size,
    quality: typeof value?.quality === "string" ? value.quality : DEFAULT_IMAGE_MODEL_CONFIG.quality,
    style: typeof value?.style === "string" ? value.style : "",
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
  const [personaAssignments, setPersonaAssignments] = useState<Record<string, string>>({});
  const [lorebookAssignments, setLorebookAssignments] = useState<Record<string, string[]>>({});
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [allConversations, setAllConversations] = useState<ConversationRecord[]>([]);
  const [conversation, setConversation] = useState<ConversationRecord | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [storyEvents, setStoryEvents] = useState<StoryEvent[]>([]);
  const [allStoryEvents, setAllStoryEvents] = useState<StoryEvent[]>([]);
  const [phoneEventStatus, setPhoneEventStatus] = useState<"idle" | "checking" | "linked" | "cooldown" | "skipped" | "error">("idle");
  const [phoneEventMessage, setPhoneEventMessage] = useState("");
  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>([]);
  const [activeModelProfileId, setActiveModelProfileId] = useState("");
  const [modelApiKeys, setModelApiKeys] = useState<Record<string, string>>({});
  const [imageModelConfig, setImageModelConfig] = useState<ImageModelConfig>(DEFAULT_IMAGE_MODEL_CONFIG);
  const [imageModelProfiles, setImageModelProfiles] = useState<ImageModelProfile[]>([]);
  const [activeImageModelProfileId, setActiveImageModelProfileId] = useState("");
  const [imageApiKeys, setImageApiKeys] = useState<Record<string, string>>({});
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "connected" | "error">("idle");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [imageConnectionStatus, setImageConnectionStatus] = useState<"idle" | "testing" | "connected" | "error">("idle");
  const [availableImageModels, setAvailableImageModels] = useState<string[]>([]);
  const [imageGenerationStatus, setImageGenerationStatus] = useState<"idle" | "generating" | "complete" | "error">("idle");
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
  const [importPreview, setImportPreview] = useState<ContentImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [runtimeError, setRuntimeError] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [contextReport, setContextReport] = useState<ContextReport | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const storyEventsRef = useRef<StoryEvent[]>([]);
  const phoneEventCheckRef = useRef(false);
  const contextLimitRef = useRef(DEFAULT_MODEL_CONFIG.contextLimit);
  const personaLibraryRef = useRef<PersonaRecord[]>([]);
  const contextResourcesRef = useRef<{
    persona: PersonaRecord | null;
    preset: PresetRecord | null;
    externalLoreEntries: LorebookRecord["entries"];
    memories: string[];
    storyEvents: StoryEvent[];
    authorNote?: AuthorNote;
    storySummary?: StorySummary;
    storyState?: StoryState;
  }>({ persona: null, preset: null, externalLoreEntries: [], memories: [], storyEvents: [], authorNote: undefined, storySummary: undefined, storyState: undefined });
  const contentLibraryRef = useRef<{
    lorebooks: LorebookRecord[];
    assignments: Record<string, string[]>;
  }>({ lorebooks: [], assignments: {} });
  const apiKey = modelApiKeys[activeModelProfileId] ?? "";
  const imageApiKey = imageApiKeys[activeImageModelProfileId] ?? "";

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
  const effectiveModelConfig = useMemo<ModelConfig>(
    () => activePreset ? { ...modelConfig, ...activePreset.modelPatch } : modelConfig,
    [activePreset, modelConfig],
  );
  const activeLorebooks = useMemo(() => {
    const assigned = new Set(lorebookAssignments[activeCharacter?.id ?? ""] ?? []);
    return lorebooks.filter((lorebook) => assigned.has(lorebook.id));
  }, [activeCharacter?.id, lorebookAssignments, lorebooks]);

  useEffect(() => {
    contextLimitRef.current = effectiveModelConfig.contextLimit;
  }, [effectiveModelConfig.contextLimit]);

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
    const fallbackPersona = personaLibraryRef.current.find((persona) => persona.id === settings.activePersonaId) ?? personaLibraryRef.current[0];
    let characterConversations = (await listConversations(character.id))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const legacyGreetingTitle = replaceRoleMacros(character.firstMessage, character.name, fallbackPersona?.name).slice(0, 28);
    const defaultStoryTitle = `与 ${character.nickname || character.name} 的故事`;
    characterConversations = await Promise.all(characterConversations.map(async (item) => {
      if (item.title !== legacyGreetingTitle && item.title !== "新的故事") return item;
      const migrated = { ...item, title: defaultStoryTitle };
      await saveConversation(migrated);
      return migrated;
    }));
    if (characterConversations.length === 0) {
      characterConversations = [await createConversationRecord(character, { personaName: fallbackPersona?.name })];
    }
    let nextConversation = characterConversations.find((item) => item.id === settings.activeConversationIds?.[character.id])
      ?? characterConversations[0];
    if (
      nextConversation.messages.length === 0
      && character.firstMessage.trim()
      && nextConversation.createdAt === nextConversation.updatedAt
    ) {
      nextConversation = {
        ...nextConversation,
        title: nextConversation.title === "新的故事" ? defaultStoryTitle : nextConversation.title,
        messages: initialMessage(character),
        updatedAt: new Date().toISOString(),
      };
      await saveConversation(nextConversation);
      characterConversations = characterConversations.map((item) => item.id === nextConversation.id ? nextConversation : item);
    }
    if (!nextConversation.storyState) {
      nextConversation = {
        ...nextConversation,
        storyState: normalizeStoryState(undefined, character, nextConversation.createdAt),
      };
      await saveConversation(nextConversation);
      characterConversations = characterConversations.map((item) => item.id === nextConversation.id ? nextConversation : item);
    }
    const nextPersona = personaLibraryRef.current.find((persona) => persona.id === settings.personaAssignments?.[nextConversation.id])
      ?? personaLibraryRef.current.find((persona) => persona.id === settings.activePersonaId)
      ?? personaLibraryRef.current[0]
      ?? null;
    const nextStoryEvents = await listStoryEvents(nextConversation.id);
    setConversations(characterConversations);
    setAllConversations((items) => [
      ...items.filter((item) => item.characterId !== character.id),
      ...characterConversations,
    ]);
    setConversation(nextConversation);
    setMessages(nextConversation.messages);
    setStoryEvents(nextStoryEvents);
    setAllStoryEvents((items) => [
      ...items.filter((item) => item.storyId !== nextConversation.id),
      ...nextStoryEvents,
    ].sort((left, right) => left.storyTime.localeCompare(right.storyTime) || left.createdAt.localeCompare(right.createdAt)));
    setPhoneEventStatus("idle");
    setPhoneEventMessage("");
    storyEventsRef.current = nextStoryEvents;
    contextResourcesRef.current.memories = (nextConversation.memories ?? [])
      .filter((memory) => memory.status === "approved")
      .map((memory) => memory.content);
    contextResourcesRef.current.storyEvents = nextStoryEvents;
    contextResourcesRef.current.authorNote = nextConversation.authorNote;
    contextResourcesRef.current.storySummary = nextConversation.storySummary;
    contextResourcesRef.current.storyState = normalizeStoryState(nextConversation.storyState, character, nextConversation.createdAt);
    contextResourcesRef.current.persona = nextPersona;
    setActivePersonaId(nextPersona?.id ?? "");
    const nextPersonaAssignments = nextPersona
      ? { ...(settings.personaAssignments ?? {}), [nextConversation.id]: nextPersona.id }
      : settings.personaAssignments ?? {};
    setPersonaAssignments(nextPersonaAssignments);
    refreshContext(character, nextConversation.messages);
    await saveSettings({
      ...settings,
      activeCharacterId: character.id,
      activePersonaId: nextPersona?.id,
      activeConversationIds: { ...(settings.activeConversationIds ?? {}), [character.id]: nextConversation.id },
      personaAssignments: nextPersonaAssignments,
      updatedAt: new Date().toISOString(),
    });
  }, [refreshContext]);

  const reloadAll = useCallback(async () => {
    const [storedCharacterRecords, storedLorebooks, storedPersonaRecords, storedPresets, settings, storedProviderApiKeys] = await Promise.all([
      listCharacters(),
      listLorebooks(),
      listPersonas(),
      listPresets(),
      getSettings(),
      listProviderApiKeys(),
    ]);
    let storedCharacters = await Promise.all(storedCharacterRecords.map(async (character) => {
      let repaired: CharacterRecord = {
        ...character,
        signature: typeof character.signature === "string" ? character.signature : "",
      };
      const recovered = readCharacterGreetings(character.raw);
      if (!repaired.firstMessage.trim() && recovered.firstMessage) {
        repaired = {
          ...repaired,
          firstMessage: recovered.firstMessage,
          alternateGreetings: repaired.alternateGreetings.length > 0 ? repaired.alternateGreetings : recovered.alternateGreetings,
        };
      }
      if (repaired.signature === character.signature && repaired.firstMessage === character.firstMessage) return character;
      repaired.updatedAt = new Date().toISOString();
      await saveCharacter(repaired);
      return repaired;
    }));
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
    personaLibraryRef.current = storedPersonas;
    setPresets(storedPresets);
    setActivePersonaId(selectedPersona.id);
    setActivePresetId(selectedPreset?.id ?? "");
    setPersonaAssignments(settings.personaAssignments ?? {});
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
      authorNote: undefined,
      storySummary: undefined,
      storyState: undefined,
    };
    const now = new Date().toISOString();
    const legacyModel = normalizeModelConfig(settings.model);
    const storedModelProfiles = settings.modelProfiles?.length
      ? settings.modelProfiles.map((profile) => ({ ...profile, name: profile.name || "未命名接口", config: normalizeModelConfig(profile.config) }))
      : [{ id: "model_profile_default", name: "默认语言接口", config: legacyModel, createdAt: now, updatedAt: now }];
    const activeModelProfile = storedModelProfiles.find((profile) => profile.id === settings.activeModelProfileId) ?? storedModelProfiles[0];
    const storedImageProfiles = settings.imageModelProfiles?.length
      ? settings.imageModelProfiles.map((profile) => ({ ...profile, name: profile.name || "未命名生图接口", config: normalizeImageModelConfig(profile.config) }))
      : [{ id: "image_profile_default", name: "默认生图接口", config: DEFAULT_IMAGE_MODEL_CONFIG, createdAt: now, updatedAt: now }];
    const activeImageProfile = storedImageProfiles.find((profile) => profile.id === settings.activeImageModelProfileId) ?? storedImageProfiles[0];
    setAppearance(normalizeAppearance(settings.appearance));
    setModelProfiles(storedModelProfiles);
    setActiveModelProfileId(activeModelProfile.id);
    contextLimitRef.current = activeModelProfile.config.contextLimit;
    setModelConfig(activeModelProfile.config);
    setModelApiKeys(Object.fromEntries(storedModelProfiles.map((profile) => [profile.id, storedProviderApiKeys[profile.id] ?? ""])));
    setImageModelProfiles(storedImageProfiles);
    setActiveImageModelProfileId(activeImageProfile.id);
    setImageModelConfig(activeImageProfile.config);
    setImageApiKeys(Object.fromEntries(storedImageProfiles.map((profile) => [profile.id, storedProviderApiKeys[profile.id] ?? ""])));
    if (settings.activePersonaId !== selectedPersona.id) {
      await saveSettings({ ...settings, activePersonaId: selectedPersona.id, updatedAt: new Date().toISOString() });
    }
    await selectCharacter(selected);
    const [storedConversations, storedStoryEvents] = await Promise.all([listAllConversations(), listAllStoryEvents()]);
    setAllConversations(storedConversations);
    setAllStoryEvents(storedStoryEvents);
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
    setAllConversations((current) => current.map((item) => item.id === nextConversation.id ? nextConversation : item));
    await saveConversation(nextConversation);
  }

  async function activateConversationRecord(nextConversation: ConversationRecord) {
    const character = activeCharacter;
    if (!character) return;
    const normalizedConversation = nextConversation.storyState
      ? nextConversation
      : { ...nextConversation, storyState: normalizeStoryState(undefined, character, nextConversation.createdAt) };
    if (!nextConversation.storyState) await saveConversation(normalizedConversation);
    const settings = await getSettings();
    const nextPersona = personaLibraryRef.current.find((persona) => persona.id === settings.personaAssignments?.[normalizedConversation.id])
      ?? personaLibraryRef.current.find((persona) => persona.id === settings.activePersonaId)
      ?? personaLibraryRef.current[0]
      ?? null;
    setConversation(normalizedConversation);
    setConversations((items) => items.map((item) => item.id === normalizedConversation.id ? normalizedConversation : item));
    setAllConversations((items) => [normalizedConversation, ...items.filter((item) => item.id !== normalizedConversation.id)]);
    setMessages(normalizedConversation.messages);
    const nextStoryEvents = await listStoryEvents(normalizedConversation.id);
    setStoryEvents(nextStoryEvents);
    setAllStoryEvents((items) => [
      ...items.filter((item) => item.storyId !== normalizedConversation.id),
      ...nextStoryEvents,
    ].sort((left, right) => left.storyTime.localeCompare(right.storyTime) || left.createdAt.localeCompare(right.createdAt)));
    setPhoneEventStatus("idle");
    setPhoneEventMessage("");
    storyEventsRef.current = nextStoryEvents;
    contextResourcesRef.current.memories = (normalizedConversation.memories ?? [])
      .filter((memory) => memory.status === "approved")
      .map((memory) => memory.content);
    contextResourcesRef.current.storyEvents = nextStoryEvents;
    contextResourcesRef.current.authorNote = normalizedConversation.authorNote;
    contextResourcesRef.current.storySummary = normalizedConversation.storySummary;
    contextResourcesRef.current.storyState = normalizeStoryState(normalizedConversation.storyState, character, normalizedConversation.createdAt);
    contextResourcesRef.current.persona = nextPersona;
    setActivePersonaId(nextPersona?.id ?? "");
    const nextPersonaAssignments = nextPersona
      ? { ...(settings.personaAssignments ?? {}), [normalizedConversation.id]: nextPersona.id }
      : settings.personaAssignments ?? {};
    setPersonaAssignments(nextPersonaAssignments);
    refreshContext(character, normalizedConversation.messages);
    await saveSettings({
      ...settings,
      activePersonaId: nextPersona?.id,
      activeConversationIds: { ...(settings.activeConversationIds ?? {}), [character.id]: normalizedConversation.id },
      personaAssignments: nextPersonaAssignments,
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
      signature: values.signature.trim(),
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
    const removedStoryIds = new Set(targetConversations.map((item) => item.id));
    setAllConversations((items) => items.filter((item) => item.characterId !== characterId));
    setAllStoryEvents((items) => items.filter((item) => !removedStoryIds.has(item.storyId)));
    const settings = await getSettings();
    const activeConversationIds = { ...(settings.activeConversationIds ?? {}) };
    delete activeConversationIds[characterId];
    const nextPersonaAssignments = Object.fromEntries(
      Object.entries(settings.personaAssignments ?? {}).filter(([storyId]) => !removedStoryIds.has(storyId)),
    );
    setPersonaAssignments(nextPersonaAssignments);
    await saveSettings({
      ...settings,
      activeCharacterId: settings.activeCharacterId === characterId ? remaining[0].id : settings.activeCharacterId,
      activeConversationIds,
      personaAssignments: nextPersonaAssignments,
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
            signature: character.signature,
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
            scan_depth: entry.scanDepth ?? 12,
            probability: entry.probability ?? 100,
            useProbability: entry.useProbability ?? false,
            recursive_scanning: entry.recursive ?? false,
            token_budget: entry.tokenBudget ?? 0,
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
    const nextConversation = await createConversationRecord(character, { title: `新会话 · ${conversations.length + 1}`, personaName: activePersona?.name });
    setConversations((current) => [nextConversation, ...current]);
    setAllConversations((current) => [nextConversation, ...current]);
    await activateConversationRecord(nextConversation);
  }

  async function applyOpeningGreeting(greeting: string) {
    const character = activeCharacter;
    const content = greeting.trim();
    if (!character || !content || streaming) return;
    const availableGreetings = new Set(
      [character.firstMessage, ...character.alternateGreetings]
        .map((item) => item.trim())
        .filter(Boolean),
    );
    if (!availableGreetings.has(content)) {
      setRuntimeError("这条开场白已不在当前角色卡中，请重新选择。");
      return;
    }

    const openingMessages = initialMessage(character, content);
    const canReplaceCurrentOpening = Boolean(conversation)
      && messages.length <= 1
      && !messages.some((message) => message.role === "user");

    if (conversation && canReplaceCurrentOpening) {
      const nextConversation: ConversationRecord = {
        ...conversation,
        title: replaceRoleMacros(content, character.name, activePersona?.name).slice(0, 28) || `与 ${character.name} 的对话`,
        messages: openingMessages,
        updatedAt: new Date().toISOString(),
      };
      setConversation(nextConversation);
      setMessages(openingMessages);
      setConversations((items) => items.map((item) => item.id === nextConversation.id ? nextConversation : item));
      setAllConversations((items) => items.map((item) => item.id === nextConversation.id ? nextConversation : item));
      await saveConversation(nextConversation);
      refreshContext(character, openingMessages);
      return;
    }

    const nextConversation = await createConversationRecord(character, {
      title: replaceRoleMacros(content, character.name, activePersona?.name).slice(0, 28) || `与 ${character.name} 的对话`,
      messages: openingMessages,
      personaName: activePersona?.name,
    });
    setConversations((current) => [nextConversation, ...current]);
    setAllConversations((current) => [nextConversation, ...current]);
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
    setAllConversations((current) => [nextConversation, ...current]);
    await activateConversationRecord(nextConversation);
  }

  async function renameConversation(conversationId: string, title: string) {
    const current = conversations.find((item) => item.id === conversationId);
    if (!current || !title.trim()) return;
    const nextConversation = { ...current, title: title.trim(), updatedAt: new Date().toISOString() };
    setConversations((items) => items.map((item) => item.id === conversationId ? nextConversation : item));
    setAllConversations((items) => items.map((item) => item.id === conversationId ? nextConversation : item));
    if (conversation?.id === conversationId) setConversation(nextConversation);
    await saveConversation(nextConversation);
  }

  async function deleteConversation(conversationId: string) {
    const character = activeCharacter;
    if (!character || streaming) return;
    await deleteStoryEvents(conversationId);
    await removeStoredConversation(conversationId);
    setAllConversations((items) => items.filter((item) => item.id !== conversationId));
    setAllStoryEvents((items) => items.filter((item) => item.storyId !== conversationId));
    const settings = await getSettings();
    const nextPersonaAssignments = Object.fromEntries(
      Object.entries(settings.personaAssignments ?? {}).filter(([storyId]) => storyId !== conversationId),
    );
    setPersonaAssignments(nextPersonaAssignments);
    await saveSettings({ ...settings, personaAssignments: nextPersonaAssignments, updatedAt: new Date().toISOString() });
    let remaining = conversations.filter((item) => item.id !== conversationId);
    if (remaining.length === 0) {
      remaining = [await createConversationRecord(character, { title: "新的故事" })];
      setAllConversations((items) => [remaining[0], ...items]);
    }
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

  async function saveAuthorNote(values: { content: string; enabled: boolean; position: AuthorNote["position"]; depth: number; durationTurns: number }) {
    const character = activeCharacter;
    if (!character || !conversation || streaming) return false;
    const content = values.content.trim();
    const durationTurns = Math.max(0, Math.round(values.durationTurns));
    const authorNote: AuthorNote | undefined = content ? {
      content,
      enabled: values.enabled,
      position: values.position,
      depth: Math.min(40, Math.max(0, Math.round(values.depth))),
      ...(durationTurns > 0 ? { expiresAfterMessageCount: messages.length + durationTurns * 2 } : {}),
      updatedAt: new Date().toISOString(),
    } : undefined;
    const nextConversation = { ...conversation, authorNote, updatedAt: new Date().toISOString() };
    setConversation(nextConversation);
    setConversations((items) => items.map((item) => item.id === nextConversation.id ? nextConversation : item));
    contextResourcesRef.current.authorNote = authorNote;
    await saveConversation(nextConversation);
    refreshContext(character, messages);
    return true;
  }

  async function saveStorySummary(contentValue: string, status: StorySummary["status"]) {
    const character = activeCharacter;
    if (!character || !conversation || streaming) return false;
    const content = contentValue.trim();
    const sameDraft = conversation.storySummary?.status === "draft" && conversation.storySummary.content === content;
    const storySummary: StorySummary | undefined = content ? {
      content,
      status,
      coveredMessageCount: sameDraft ? conversation.storySummary?.coveredMessageCount ?? messages.length : messages.length,
      updatedAt: new Date().toISOString(),
    } : undefined;
    const nextConversation = { ...conversation, storySummary, updatedAt: new Date().toISOString() };
    setConversation(nextConversation);
    setConversations((items) => items.map((item) => item.id === nextConversation.id ? nextConversation : item));
    contextResourcesRef.current.storySummary = storySummary;
    await saveConversation(nextConversation);
    refreshContext(character, messages);
    return true;
  }

  async function generateStorySummaryDraft() {
    const character = activeCharacter;
    if (!character || !conversation || streaming || messages.length === 0) return null;
    setRuntimeError("");
    if (!modelIsReady()) return null;
    const personaName = activePersona?.name ?? "用户";
    const transcript = messages.slice(-80).map((message) => `${message.role === "assistant" ? character.name : personaName}：${message.content}`).join("\n\n");
    const controller = new AbortController();
    try {
      const content = await generateChatCompletion({
        config: effectiveModelConfig,
        apiKey,
        signal: controller.signal,
        maxTokens: Math.min(effectiveModelConfig.maxTokens, 1000),
        temperature: 0.2,
        messages: [
          { role: "system", content: "你是剧情档案整理器。只总结已经明确发生的事实，不补写、不推测。保留：重要事件、当前场景与时间、人物关系变化、承诺、秘密、未完成事项和伏笔。使用简洁中文分点输出。" },
          { role: "user", content: `请整理以下剧情记录：\n\n${transcript}` },
        ],
      });
      await saveStorySummary(content, "draft");
      return content;
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "剧情摘要生成失败。");
      return null;
    }
  }

  async function commitStoryEvent(event: StoryEvent, contextMessages: StoredMessage[] = messages) {
    const character = activeCharacter;
    if (!character) return;
    await saveStoryEvent(event);
    const nextEvents = [...storyEventsRef.current.filter((item) => item.id !== event.id), event]
      .sort((left, right) => left.storyTime.localeCompare(right.storyTime) || left.createdAt.localeCompare(right.createdAt));
    storyEventsRef.current = nextEvents;
    setStoryEvents(nextEvents);
    setAllStoryEvents((items) => [...items.filter((item) => item.id !== event.id), event]
      .sort((left, right) => left.storyTime.localeCompare(right.storyTime) || left.createdAt.localeCompare(right.createdAt)));
    contextResourcesRef.current.storyEvents = nextEvents;
    refreshContext(character, contextMessages);
  }

  async function persistStoryStateChange(
    nextState: StoryState,
    eventType: "time_advanced" | "story_state_changed",
    content: string,
    reason: string,
  ) {
    const character = activeCharacter;
    const persona = activePersona;
    const currentStory = conversation;
    if (!character || !currentStory) return false;
    const previousState = normalizeStoryState(currentStory.storyState, character, currentStory.createdAt);
    const normalizedState = normalizeStoryState({ ...nextState, updatedAt: new Date().toISOString() }, character, currentStory.createdAt);
    const nextConversation: ConversationRecord = {
      ...currentStory,
      storyState: normalizedState,
      updatedAt: new Date().toISOString(),
    };
    setConversation(nextConversation);
    setConversations((items) => items.map((item) => item.id === nextConversation.id ? nextConversation : item));
    contextResourcesRef.current.storyState = normalizedState;
    await saveConversation(nextConversation);
    const event = createStoryEvent({
      storyId: currentStory.id,
      eventType,
      actorId: persona?.id ?? "user",
      targetId: currentStory.id,
      content,
      source: "user",
      storyTime: normalizedState.currentTime,
      metadata: { reason, previousStoryState: previousState, nextStoryState: normalizedState },
    });
    await commitStoryEvent(event);
    return true;
  }

  async function saveStoryState(values: Pick<StoryState, "currentTime" | "location" | "weather" | "scene" | "npcInitiative" | "cooldownMinutes">) {
    const character = activeCharacter;
    if (!character || !conversation) return false;
    setRuntimeError("");
    const currentState = normalizeStoryState(conversation.storyState, character, conversation.createdAt);
    const nextState = normalizeStoryState({ ...currentState, ...values, updatedAt: new Date().toISOString() }, character, conversation.createdAt);
    const changes = [
      currentState.currentTime !== nextState.currentTime ? `时间改为 ${new Date(nextState.currentTime).toLocaleString("zh-CN")}` : "",
      currentState.location !== nextState.location ? `地点改为 ${nextState.location || "未设定"}` : "",
      currentState.weather !== nextState.weather ? `天气改为 ${nextState.weather || "未设定"}` : "",
      currentState.scene !== nextState.scene ? `场景改为 ${nextState.scene || "未设定"}` : "",
      currentState.npcInitiative !== nextState.npcInitiative ? `主动性 ${nextState.npcInitiative}` : "",
      currentState.cooldownMinutes !== nextState.cooldownMinutes ? `冷却 ${nextState.cooldownMinutes} 分钟` : "",
    ].filter(Boolean);
    if (changes.length === 0) return true;
    return persistStoryStateChange(nextState, "story_state_changed", changes.join("；"), "用户编辑剧情状态");
  }

  async function advanceStoryTime(minutes: number) {
    const character = activeCharacter;
    if (!character || !conversation) return false;
    const normalizedMinutes = Math.min(525600, Math.max(1, Math.round(minutes)));
    const currentState = normalizeStoryState(conversation.storyState, character, conversation.createdAt);
    const nextState = {
      ...currentState,
      currentTime: new Date(Date.parse(currentState.currentTime) + normalizedMinutes * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const hours = normalizedMinutes / 60;
    const label = normalizedMinutes % 1440 === 0
      ? `${normalizedMinutes / 1440} 天`
      : Number.isInteger(hours) ? `${hours} 小时` : `${normalizedMinutes} 分钟`;
    const saved = await persistStoryStateChange(nextState, "time_advanced", `剧情时间向前推进 ${label}`, "用户推进剧情时间");
    if (saved) await requestPhoneEvent(messages, false, nextState);
    return saved;
  }

  async function requestPhoneEvent(contextMessages: StoredMessage[] = messages, force = true, storyStateOverride?: StoryState) {
    const character = activeCharacter;
    const persona = activePersona;
    const currentStory = conversation;
    if (!character || !persona || !currentStory || phoneEventCheckRef.current) return false;
    if (!modelIsReady()) {
      setPhoneEventStatus("error");
      setPhoneEventMessage("模型尚未配置，时间已经保存，但无法检查 NPC 行为。");
      return false;
    }
    const storyState = normalizeStoryState(storyStateOverride ?? currentStory.storyState, character, currentStory.createdAt);
    if (!force && storyState.lastNpcActionAt) {
      const elapsedMinutes = (Date.parse(storyState.currentTime) - Date.parse(storyState.lastNpcActionAt)) / 60000;
      if (elapsedMinutes < storyState.cooldownMinutes) {
        const remaining = Math.max(1, Math.ceil(storyState.cooldownMinutes - elapsedMinutes));
        setPhoneEventStatus("cooldown");
        setPhoneEventMessage(`NPC 仍在剧情冷却中，约 ${remaining} 分钟后可再次主动联系。`);
        return false;
      }
    }

    phoneEventCheckRef.current = true;
    setPhoneEventStatus("checking");
    setPhoneEventMessage("正在根据剧情时间、角色状态与最近互动进行一次受控检查…");
    const controller = new AbortController();
    const transcript = contextMessages.slice(-10).map((message) => `${message.role === "assistant" ? character.name : persona.name}：${message.content}`).join("\n");
    const phoneHistory = storyEventsRef.current
      .filter((event) => event.status === "committed" && (event.eventType === "phone_message_received" || event.eventType === "phone_message_sent"))
      .slice(-8)
      .map((event) => `${event.actorId === character.id ? character.name : persona.name}：${event.content}`).join("\n");
    const decisionRule = force
      ? "本次由用户主动请求检查，可以忽略冷却，但仍然必须判断角色是否真的有理由联系用户，不要强制制造消息。"
      : "只有当角色在当前剧情状态下确实有理由额外联系用户时才将 shouldSend 设为 true；不要为了制造通知而强行发送。";
    try {
      const raw = await generateChatCompletion({
        config: effectiveModelConfig,
        apiKey,
        signal: controller.signal,
        maxTokens: 220,
        temperature: Math.min(effectiveModelConfig.temperature, 0.72),
        messages: [
          {
            role: "system",
            content: `你是剧情事件规划器，不负责续写主聊天。${decisionRule}\n角色：${character.name}\n角色设定：${character.description}\n性格：${character.personality}\n当前剧情时间：${new Date(storyState.currentTime).toLocaleString("zh-CN")}\n当前地点：${storyState.location || "未设定"}\n当前场景：${storyState.scene || character.scenario || "未设定"}\nNPC 主动性：${storyState.npcInitiative}/100\n用户人设：${persona.name}，${persona.description}\n只输出严格 JSON，不要 Markdown：{"shouldSend":true或false,"confidence":0到100,"content":"手机消息正文","reason":"触发理由"}。confidence 表示此时主动联系的合理程度。消息必须像即时通讯，保持角色语言习惯，不替用户行动，不引入未发生的事实，正文最多 600 字。`,
          },
          { role: "user", content: `最近主剧情：\n${transcript || "尚无主剧情消息"}\n\n已确认手机通信：\n${phoneHistory || "尚无手机消息"}` },
        ],
      });
      const proposal = parsePhoneMessageProposal(raw);
      const requiredConfidence = Math.max(5, 100 - storyState.npcInitiative);
      if (!proposal.shouldSend || proposal.confidence < requiredConfidence) {
        setPhoneEventStatus("skipped");
        setPhoneEventMessage(proposal.reason || `本次合理度 ${proposal.confidence}，未达到当前主动性阈值。`);
        return false;
      }
      const event = createStoryEvent({
        storyId: currentStory.id,
        eventType: "phone_message_received",
        actorId: character.id,
        targetId: persona.id,
        content: proposal.content,
        source: "ai",
        storyTime: storyState.currentTime,
        metadata: { reason: proposal.reason },
      });
      if (isDuplicatePhoneEvent(storyEventsRef.current, event)) {
        setPhoneEventStatus("skipped");
        setPhoneEventMessage("检测到重复消息，本次没有再次写入时间线。");
        return false;
      }
      await commitStoryEvent(event, contextMessages);
      const nextStoryState = { ...storyState, lastNpcActionAt: storyState.currentTime, updatedAt: new Date().toISOString() };
      const nextConversation: ConversationRecord = {
        ...currentStory,
        messages: contextMessages,
        storyState: nextStoryState,
        updatedAt: new Date().toISOString(),
      };
      setConversation(nextConversation);
      setConversations((items) => items.map((item) => item.id === nextConversation.id ? nextConversation : item));
      contextResourcesRef.current.storyState = nextStoryState;
      await saveConversation(nextConversation);
      setPhoneEventStatus("linked");
      setPhoneEventMessage(proposal.reason || `${character.name} 在当前剧情状态下主动发来消息。`);
      return true;
    } catch (error) {
      setPhoneEventStatus("error");
      setPhoneEventMessage(error instanceof Error ? error.message : "NPC 行为检查失败。");
      return false;
    } finally {
      phoneEventCheckRef.current = false;
    }
  }

  async function ensurePhoneStory(characterId: string) {
    const character = characters.find((item) => item.id === characterId);
    if (!character) return null;
    const settings = await getSettings();
    let characterStories = allConversations.filter((item) => item.characterId === characterId);
    if (characterStories.length === 0) characterStories = await listConversations(characterId);
    let target = characterStories.find((item) => item.id === settings.activeConversationIds?.[characterId])
      ?? [...characterStories].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    if (!target) {
      const persona = personas.find((item) => item.id === settings.activePersonaId) ?? personas[0];
      target = await createConversationRecord(character, { personaName: persona?.name });
      const nextPersonaAssignments = persona
        ? { ...(settings.personaAssignments ?? {}), [target.id]: persona.id }
        : settings.personaAssignments ?? {};
      setPersonaAssignments(nextPersonaAssignments);
      await saveSettings({
        ...settings,
        activeConversationIds: { ...(settings.activeConversationIds ?? {}), [characterId]: target.id },
        personaAssignments: nextPersonaAssignments,
        updatedAt: new Date().toISOString(),
      });
    }
    setAllConversations((items) => [target, ...items.filter((item) => item.id !== target.id)]);
    return target;
  }

  async function sendPhoneMessageToStory(characterId: string, storyId: string | undefined, content: string) {
    const character = characters.find((item) => item.id === characterId);
    const targetStory = storyId
      ? allConversations.find((item) => item.id === storyId) ?? (await listConversations(characterId)).find((item) => item.id === storyId)
      : await ensurePhoneStory(characterId);
    if (!character || !targetStory || !content.trim()) return false;
    const settings = await getSettings();
    const persona = personas.find((item) => item.id === settings.personaAssignments?.[targetStory.id])
      ?? activePersona
      ?? personas[0];
    if (!persona) return false;
    const targetEvents = targetStory.id === conversation?.id
      ? storyEventsRef.current
      : allStoryEvents.filter((item) => item.storyId === targetStory.id);
    const storyState = normalizeStoryState(targetStory.storyState, character, targetStory.createdAt);
    const latestIncoming = [...targetEvents].reverse().find((event) => event.status === "committed" && event.eventType === "phone_message_received");
    const event = createStoryEvent({
      storyId: targetStory.id,
      eventType: "phone_message_sent",
      actorId: persona.id,
      targetId: character.id,
      content: content.trim(),
      source: "user",
      replyToEventId: latestIncoming?.id,
      storyTime: storyState.currentTime,
    });
    if (targetStory.id === conversation?.id) {
      await commitStoryEvent(event);
    } else {
      await saveStoryEvent(event);
      setAllStoryEvents((items) => [...items.filter((item) => item.id !== event.id), event]
        .sort((left, right) => left.storyTime.localeCompare(right.storyTime) || left.createdAt.localeCompare(right.createdAt)));
    }
    setPhoneEventStatus("linked");
    setPhoneEventMessage(`发给 ${character.name} 的回复已写入对应剧情时间线。`);
    return true;
  }

  async function sendPhoneMessage(content: string) {
    if (!activeCharacter || !conversation) return false;
    return sendPhoneMessageToStory(activeCharacter.id, conversation.id, content);
  }

  async function revertStoryEvent(eventId: string) {
    const character = activeCharacter;
    const currentStory = conversation;
    const target = storyEventsRef.current.find((event) => event.id === eventId);
    if (!character || !currentStory || !target || target.status === "reverted") return false;
    setRuntimeError("");
    const stateEvent = target.eventType === "time_advanced" || target.eventType === "story_state_changed";
    if (stateEvent) {
      const hasLaterCommittedEvent = storyEventsRef.current.some((event) => event.status === "committed" && event.createdAt > target.createdAt);
      if (hasLaterCommittedEvent || !target.metadata?.previousStoryState) {
        setRuntimeError("请先回滚这次状态变更之后的事件，再恢复剧情时间，避免产生时间冲突。");
        return false;
      }
      const restoredState = normalizeStoryState(target.metadata.previousStoryState, character, currentStory.createdAt);
      const nextConversation = { ...currentStory, storyState: restoredState, updatedAt: new Date().toISOString() };
      setConversation(nextConversation);
      setConversations((items) => items.map((item) => item.id === nextConversation.id ? nextConversation : item));
      contextResourcesRef.current.storyState = restoredState;
      await saveConversation(nextConversation);
    }
    await commitStoryEvent({ ...target, status: "reverted" });
    setPhoneEventMessage("事件已回滚，模型上下文与手机记录已同步更新。");
    return true;
  }

  async function markPhoneEventsRead(storyId = conversation?.id) {
    if (!storyId) return;
    const now = new Date().toISOString();
    const sourceEvents = storyId === conversation?.id
      ? storyEventsRef.current
      : allStoryEvents.filter((event) => event.storyId === storyId);
    const changed = sourceEvents.filter((event) => event.status === "committed" && event.eventType === "phone_message_received" && !event.readAt);
    if (changed.length === 0) return;
    const changedIds = new Set(changed.map((event) => event.id));
    const nextEvents = sourceEvents.map((event) => changedIds.has(event.id) ? { ...event, readAt: now } : event);
    await Promise.all(nextEvents.filter((event) => changedIds.has(event.id)).map((event) => saveStoryEvent(event)));
    setAllStoryEvents((items) => items.map((event) => changedIds.has(event.id) ? { ...event, readAt: now } : event));
    if (storyId === conversation?.id) {
      storyEventsRef.current = nextEvents;
      contextResourcesRef.current.storyEvents = nextEvents;
      setStoryEvents(nextEvents);
    }
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
    const reasoningPrefix = target.mode === "append" ? target.message.reasoning ?? "" : "";
    const assistantMessage: StoredMessage = sourceMessage
      ? { ...sourceMessage, content: prefix, reasoning: reasoningPrefix, finishReason: undefined, status: "streaming" }
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

    const compiled = compileContext(character, requestMessages, effectiveModelConfig.contextLimit, contextResourcesRef.current);
    setContextReport(compiled.report);
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    let assistantText = "";
    let reasoningText = "";
    let automaticContinuations = 0;
    let finalFinishReason: string | null = null;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let usageReported = false;
    let completedForPhoneEvent: StoredMessage[] | null = null;

    try {
      let modelMessages = target.mode === "append"
        ? [...compiled.messages, { role: "system" as const, content: "请无缝继续上一条角色回复，不要重复已经写出的内容。" }]
        : compiled.messages;

      while (true) {
        const result = await streamChatCompletion({
          config: effectiveModelConfig,
          apiKey,
          messages: modelMessages,
          signal: controller.signal,
          onDelta: (delta) => {
            assistantText += delta;
            const embedded = splitEmbeddedReasoning(`${prefix}${assistantText}`);
            setMessages((current) => current.map((message) => message.id === assistantMessage.id
              ? { ...message, content: embedded.content, reasoning: [`${reasoningPrefix}${reasoningText}`.trim(), embedded.reasoning].filter(Boolean).join("\n\n") || undefined }
              : message));
          },
          onReasoningDelta: (delta) => {
            reasoningText += delta;
            const embedded = splitEmbeddedReasoning(`${prefix}${assistantText}`);
            setMessages((current) => current.map((message) => message.id === assistantMessage.id
              ? { ...message, content: embedded.content, reasoning: [`${reasoningPrefix}${reasoningText}`.trim(), embedded.reasoning].filter(Boolean).join("\n\n") || undefined }
              : message));
          },
        });
        finalFinishReason = result.finishReason;
        if (result.usage) {
          usageReported = true;
          promptTokens += result.usage.promptTokens ?? 0;
          completionTokens += result.usage.completionTokens ?? 0;
          totalTokens += result.usage.totalTokens ?? 0;
        }
        if (!result.finishReason || !TRUNCATED_FINISH_REASONS.has(result.finishReason) || automaticContinuations >= AUTO_CONTINUATION_LIMIT) break;
        automaticContinuations += 1;
        const fullContent = splitEmbeddedReasoning(`${prefix}${assistantText}`).content;
        const continuationMessages = [...compiled.messages];
        const lastMessage = continuationMessages.at(-1);
        if (lastMessage?.role === "assistant") {
          continuationMessages[continuationMessages.length - 1] = { ...lastMessage, content: fullContent };
        } else {
          continuationMessages.push({ role: "assistant", content: fullContent });
        }
        modelMessages = [...continuationMessages, { role: "system", content: "上一条回复因输出上限被截断。请从中断处直接继续，不要重复已经输出的文字。" }];
      }
      if (!assistantText.trim()) throw new Error("模型没有返回文本内容。");
      const embeddedResult = splitEmbeddedReasoning(`${prefix}${assistantText}`);
      const completedContent = embeddedResult.content;
      const completedReasoning = [`${reasoningPrefix}${reasoningText}`.trim(), embeddedResult.reasoning].filter(Boolean).join("\n\n");
      const continuationCount = (target.mode === "append" ? (target.message.continuationCount ?? 0) + 1 : 0) + automaticContinuations;
      const generatedTokens = usageReported && completionTokens > 0 ? completionTokens : estimateTokens(assistantText);
      const truncated = TRUNCATED_FINISH_REASONS.has(finalFinishReason ?? "")
        || (finalFinishReason === "stream_ended" && generatedTokens >= effectiveModelConfig.maxTokens * 0.92);
      const completed = visibleMessages.map((message) => message.id === assistantMessage.id
        ? {
            ...message,
            content: completedContent,
            reasoning: completedReasoning || undefined,
            finishReason: finalFinishReason ?? undefined,
            continuationCount: continuationCount || undefined,
            status: truncated ? "truncated" as const : "complete" as const,
            promptTokens: usageReported && promptTokens > 0 ? promptTokens : undefined,
            completionTokens: generatedTokens,
            totalTokens: usageReported && totalTokens > 0 ? totalTokens : undefined,
            tokenCountEstimated: !(usageReported && completionTokens > 0),
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
      const partialResult = splitEmbeddedReasoning(`${prefix}${assistantText}`);
      const partialContent = partialResult.content;
      const partialReasoning = [`${reasoningPrefix}${reasoningText}`.trim(), partialResult.reasoning].filter(Boolean).join("\n\n");
      const failed = visibleMessages.map((message) => message.id === assistantMessage.id
        ? target.mode === "replace" && !assistantText
          ? { ...target.message, status: "complete" as const }
          : {
              ...message,
              content: partialContent || (stopped ? "" : "生成失败"),
              reasoning: partialReasoning || undefined,
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
      return {
        ...message,
        content: nextContent,
        alternatives,
        editedAt: new Date().toISOString(),
        status: "complete" as const,
        finishReason: undefined,
        promptTokens: undefined,
        completionTokens: undefined,
        totalTokens: undefined,
        tokenCountEstimated: undefined,
      };
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
        const settings = await getSettings();
        await saveSettings({
          ...settings,
          activePresetId: importPreview.record.id,
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

  async function syncLorebookLibrary(nextLorebooks: LorebookRecord[], nextAssignments: Record<string, string[]>) {
    setLorebooks(nextLorebooks);
    setLorebookAssignments(nextAssignments);
    contentLibraryRef.current = { lorebooks: nextLorebooks, assignments: nextAssignments };
    const assigned = new Set(nextAssignments[activeCharacter?.id ?? ""] ?? []);
    contextResourcesRef.current.externalLoreEntries = nextLorebooks
      .filter((lorebook) => assigned.has(lorebook.id))
      .flatMap((lorebook) => lorebook.entries);
    const settings = await getSettings();
    await saveSettings({ ...settings, lorebookAssignments: nextAssignments, updatedAt: new Date().toISOString() });
    if (activeCharacter) refreshContext(activeCharacter, messages);
  }

  async function saveLorebookProfile(lorebookId: string | undefined, values: LorebookEditorValues) {
    const existing = lorebookId ? lorebooks.find((lorebook) => lorebook.id === lorebookId) : undefined;
    const now = new Date().toISOString();
    const entries = values.entries.map((entry, index) => ({
      ...entry,
      id: entry.id || createId("lore"),
      name: entry.name.trim() || `条目 ${index + 1}`,
      keys: [...entry.keys],
      secondaryKeys: [...entry.secondaryKeys],
      content: entry.content.trim(),
      insertionOrder: index,
      scanDepth: Math.min(100, Math.max(1, Math.round(entry.scanDepth ?? 12))),
      probability: Math.min(100, Math.max(0, Math.round(entry.probability ?? 100))),
      useProbability: Boolean(entry.useProbability),
      recursive: Boolean(entry.recursive),
      tokenBudget: Math.max(0, Math.round(entry.tokenBudget ?? 0)),
      extensions: { ...entry.extensions },
    }));
    if (!values.name.trim()) {
      setRuntimeError("世界书名称不能为空。");
      return null;
    }
    if (entries.length === 0) {
      setRuntimeError("世界书至少需要一个条目。");
      return null;
    }
    const lorebook: LorebookRecord = existing
      ? { ...existing, name: values.name.trim(), entries, updatedAt: now }
      : {
          id: createId("lorebook"),
          schemaVersion: 1,
          name: values.name.trim(),
          sourceName: "Created in Lunemir",
          entries,
          raw: {},
          createdAt: now,
          updatedAt: now,
        };
    await saveLorebook(lorebook);
    const nextLorebooks = existing
      ? lorebooks.map((item) => item.id === lorebook.id ? lorebook : item)
      : [lorebook, ...lorebooks];
    const nextAssignments = !existing && activeCharacter
      ? {
          ...lorebookAssignments,
          [activeCharacter.id]: [...new Set([...(lorebookAssignments[activeCharacter.id] ?? []), lorebook.id])],
        }
      : lorebookAssignments;
    await syncLorebookLibrary(nextLorebooks, nextAssignments);
    return lorebook;
  }

  async function saveCharacterLorebook(characterId: string, values: LorebookEditorValues) {
    const character = characters.find((item) => item.id === characterId);
    if (!character) return null;
    if (!values.name.trim()) {
      setRuntimeError("世界书名称不能为空。");
      return null;
    }
    const entries = values.entries.map((entry, index) => ({
      ...entry,
      id: entry.id || createId("lore"),
      name: entry.name.trim() || `条目 ${index + 1}`,
      keys: [...entry.keys],
      secondaryKeys: [...entry.secondaryKeys],
      content: entry.content.trim(),
      insertionOrder: index,
      scanDepth: Math.min(100, Math.max(1, Math.round(entry.scanDepth ?? 12))),
      probability: Math.min(100, Math.max(0, Math.round(entry.probability ?? 100))),
      useProbability: Boolean(entry.useProbability),
      recursive: Boolean(entry.recursive),
      tokenBudget: Math.max(0, Math.round(entry.tokenBudget ?? 0)),
      extensions: { ...entry.extensions },
    }));
    if (entries.length === 0) {
      setRuntimeError("世界书至少需要一个条目。");
      return null;
    }
    const updated: CharacterRecord = {
      ...character,
      lorebookName: values.name.trim(),
      lorebookEntries: entries,
      updatedAt: new Date().toISOString(),
    };
    await saveCharacter(updated);
    setCharacters((items) => items.map((item) => item.id === characterId ? updated : item));
    if (activeCharacter?.id === characterId) refreshContext(updated, messages);
    return updated;
  }

  async function duplicateLorebook(lorebookId: string) {
    const source = lorebooks.find((lorebook) => lorebook.id === lorebookId);
    if (!source) return null;
    const now = new Date().toISOString();
    const duplicate: LorebookRecord = {
      ...source,
      id: createId("lorebook"),
      name: `${source.name} · 副本`,
      sourceName: source.sourceName || source.name,
      entries: source.entries.map((entry, index) => ({
        ...entry,
        id: createId("lore"),
        keys: [...entry.keys],
        secondaryKeys: [...entry.secondaryKeys],
        insertionOrder: index,
        extensions: { ...entry.extensions },
      })),
      raw: { ...source.raw },
      createdAt: now,
      updatedAt: now,
    };
    await saveLorebook(duplicate);
    const nextAssignments = activeCharacter
      ? {
          ...lorebookAssignments,
          [activeCharacter.id]: [...new Set([...(lorebookAssignments[activeCharacter.id] ?? []), duplicate.id])],
        }
      : lorebookAssignments;
    await syncLorebookLibrary([duplicate, ...lorebooks], nextAssignments);
    return duplicate;
  }

  async function deleteLorebookProfile(lorebookId: string) {
    const target = lorebooks.find((lorebook) => lorebook.id === lorebookId);
    if (!target) return false;
    await removeStoredLorebook(lorebookId);
    const nextLorebooks = lorebooks.filter((lorebook) => lorebook.id !== lorebookId);
    const nextAssignments = Object.fromEntries(
      Object.entries(lorebookAssignments).map(([characterId, ids]) => [characterId, ids.filter((id) => id !== lorebookId)]),
    );
    await syncLorebookLibrary(nextLorebooks, nextAssignments);
    return true;
  }

  function downloadLorebook(lorebookId: string) {
    const lorebook = lorebooks.find((item) => item.id === lorebookId);
    if (!lorebook) return;
    const entries = Object.fromEntries(lorebook.entries.map((entry, index) => [String(index), {
      uid: entry.id,
      key: entry.keys,
      keysecondary: entry.secondaryKeys,
      comment: entry.name,
      content: entry.content,
      constant: entry.constant,
      selective: entry.selective,
      order: entry.priority,
      insertion_order: entry.insertionOrder,
      disable: !entry.enabled,
      case_sensitive: entry.caseSensitive,
      scan_depth: entry.scanDepth ?? 12,
      probability: entry.probability ?? 100,
      useProbability: entry.useProbability ?? false,
      recursive_scanning: entry.recursive ?? false,
      token_budget: entry.tokenBudget ?? 0,
      extensions: entry.extensions,
    }]));
    const payload = { ...lorebook.raw, name: lorebook.name, entries };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${lorebook.name.replace(/[\\/:*?"<>|]/g, "-") || "lunemir-world-info"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function applyPersonaRecord(persona: PersonaRecord) {
    setActivePersonaId(persona.id);
    contextResourcesRef.current.persona = persona;
    const settings = await getSettings();
    const nextAssignments = conversation
      ? { ...(settings.personaAssignments ?? {}), [conversation.id]: persona.id }
      : settings.personaAssignments ?? {};
    setPersonaAssignments(nextAssignments);
    await saveSettings({
      ...settings,
      activePersonaId: persona.id,
      personaAssignments: nextAssignments,
      updatedAt: new Date().toISOString(),
    });
    if (activeCharacter) refreshContext(activeCharacter, messages);
  }

  async function savePersonaProfile(personaId: string | undefined, values: PersonaEditorValues) {
    const existing = personaId ? personas.find((persona) => persona.id === personaId) : undefined;
    const now = new Date().toISOString();
    const normalized: PersonaEditorValues = {
      ...values,
      name: values.name.trim(),
      description: values.description.trim(),
      appearance: values.appearance?.trim(),
      personality: values.personality?.trim(),
      identity: values.identity?.trim(),
      occupation: values.occupation?.trim(),
      background: values.background?.trim(),
      relationships: values.relationships?.trim(),
      currentState: values.currentState?.trim(),
      notes: values.notes?.trim(),
    };
    if (!normalized.name) {
      setRuntimeError("人设名称不能为空。");
      return null;
    }
    const persona: PersonaRecord = existing
      ? { ...existing, ...normalized, updatedAt: now }
      : {
          id: createId("persona"),
          schemaVersion: 1,
          ...normalized,
          createdAt: now,
          updatedAt: now,
        };
    await savePersona(persona);
    const nextPersonas = existing
      ? personas.map((item) => item.id === persona.id ? persona : item)
      : [persona, ...personas];
    setPersonas(nextPersonas);
    personaLibraryRef.current = nextPersonas;
    if (!existing) await applyPersonaRecord(persona);
    else if (activePersonaId === persona.id) {
      contextResourcesRef.current.persona = persona;
      if (activeCharacter) refreshContext(activeCharacter, messages);
    }
    return persona;
  }

  async function activatePersona(personaId: string) {
    const persona = personas.find((item) => item.id === personaId);
    if (persona) await applyPersonaRecord(persona);
  }

  async function duplicatePersona(personaId: string) {
    const source = personas.find((persona) => persona.id === personaId);
    if (!source) return null;
    const now = new Date().toISOString();
    const duplicate: PersonaRecord = {
      ...source,
      id: createId("persona"),
      name: `${source.name} · 副本`,
      createdAt: now,
      updatedAt: now,
    };
    await savePersona(duplicate);
    const nextPersonas = [duplicate, ...personas];
    setPersonas(nextPersonas);
    personaLibraryRef.current = nextPersonas;
    await applyPersonaRecord(duplicate);
    return duplicate;
  }

  async function deletePersonaProfile(personaId: string) {
    if (personas.length <= 1) {
      setRuntimeError("至少需要保留一个用户人设。");
      return false;
    }
    const target = personas.find((persona) => persona.id === personaId);
    if (!target) return false;
    await removeStoredPersona(personaId);
    const nextPersonas = personas.filter((persona) => persona.id !== personaId);
    const fallback = nextPersonas[0];
    const settings = await getSettings();
    const cleanedAssignments = Object.fromEntries(
      Object.entries(settings.personaAssignments ?? {}).filter(([, assignedPersonaId]) => assignedPersonaId !== personaId),
    );
    const nextActive = activePersonaId === personaId ? fallback : activePersona;
    const nextAssignments = nextActive && conversation
      ? { ...cleanedAssignments, [conversation.id]: nextActive.id }
      : cleanedAssignments;
    setPersonas(nextPersonas);
    personaLibraryRef.current = nextPersonas;
    setPersonaAssignments(nextAssignments);
    if (nextActive) {
      setActivePersonaId(nextActive.id);
      contextResourcesRef.current.persona = nextActive;
    }
    await saveSettings({
      ...settings,
      activePersonaId: nextActive?.id,
      personaAssignments: nextAssignments,
      updatedAt: new Date().toISOString(),
    });
    if (activeCharacter) refreshContext(activeCharacter, messages);
    return true;
  }

  async function applyPresetRecord(preset: PresetRecord | null) {
    setActivePresetId(preset?.id ?? "");
    contextResourcesRef.current.preset = preset;
    const nextModel = preset ? { ...modelConfig, ...preset.modelPatch } : modelConfig;
    contextLimitRef.current = nextModel.contextLimit;
    const settings = await getSettings();
    await saveSettings({ ...settings, activePresetId: preset?.id, updatedAt: new Date().toISOString() });
    if (activeCharacter) refreshContext(activeCharacter, messages);
  }

  async function savePresetProfile(presetId: string | undefined, values: PresetEditorValues) {
    const existing = presetId ? presets.find((preset) => preset.id === presetId) : undefined;
    const now = new Date().toISOString();
    const modules = values.modules.map((module, index) => ({
      ...module,
      id: module.id || createId("prompt"),
      name: module.name.trim() || `提示词模块 ${index + 1}`,
      content: module.content.trim(),
      priority: Number.isFinite(module.priority) ? module.priority : 0,
      order: index,
    }));
    if (!values.name.trim()) {
      setRuntimeError("预设名称不能为空。");
      return null;
    }
    if (modules.length === 0) {
      setRuntimeError("预设至少需要一个提示词模块。");
      return null;
    }
    const enabledModules = modules
      .filter((module) => module.enabled && module.content)
      .sort((left, right) => right.priority - left.priority || left.order - right.order);
    const preset: PresetRecord = existing
      ? {
          ...existing,
          name: values.name.trim(),
          modules,
          systemPrompt: enabledModules.filter((module) => module.position === "system").map((module) => module.content).join("\n\n"),
          postHistoryInstructions: enabledModules.filter((module) => module.position === "post_history").map((module) => module.content).join("\n\n"),
          modelPatch: { ...values.modelPatch },
          outputRenderer: normalizeOutputRenderer(values.outputRenderer),
          updatedAt: now,
        }
      : {
          id: createId("preset"),
          schemaVersion: 1,
          name: values.name.trim(),
          sourceName: "Created in Lunemir",
          modules,
          systemPrompt: enabledModules.filter((module) => module.position === "system").map((module) => module.content).join("\n\n"),
          postHistoryInstructions: enabledModules.filter((module) => module.position === "post_history").map((module) => module.content).join("\n\n"),
          modelPatch: { ...values.modelPatch },
          outputRenderer: normalizeOutputRenderer(values.outputRenderer),
          raw: {},
          createdAt: now,
          updatedAt: now,
        };
    await savePreset(preset);
    setPresets(existing ? presets.map((item) => item.id === preset.id ? preset : item) : [preset, ...presets]);
    await applyPresetRecord(preset);
    return preset;
  }

  async function duplicatePreset(presetId: string) {
    const source = presets.find((preset) => preset.id === presetId);
    if (!source) return null;
    const now = new Date().toISOString();
    const duplicate: PresetRecord = {
      ...source,
      id: createId("preset"),
      name: `${source.name} · 副本`,
      sourceName: source.sourceName || source.name,
      modules: source.modules?.map((module, index) => ({ ...module, id: createId("prompt"), order: index })),
      modelPatch: { ...source.modelPatch },
      outputRenderer: normalizeOutputRenderer(source.outputRenderer),
      raw: { ...source.raw },
      createdAt: now,
      updatedAt: now,
    };
    await savePreset(duplicate);
    setPresets([duplicate, ...presets]);
    await applyPresetRecord(duplicate);
    return duplicate;
  }

  async function deletePresetProfile(presetId: string) {
    const target = presets.find((preset) => preset.id === presetId);
    if (!target) return false;
    await removeStoredPreset(presetId);
    setPresets(presets.filter((preset) => preset.id !== presetId));
    if (activePresetId === presetId) await applyPresetRecord(null);
    return true;
  }

  function downloadPreset(presetId: string) {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    const modules = preset.modules ?? [
      ...(preset.systemPrompt ? [{ id: "main", name: "System Prompt", content: preset.systemPrompt, enabled: true, position: "system" as const, priority: 0, order: 0 }] : []),
      ...(preset.postHistoryInstructions ? [{ id: "jailbreak", name: "Post-History Instructions", content: preset.postHistoryInstructions, enabled: true, position: "post_history" as const, priority: 0, order: 1 }] : []),
    ];
    const ordered = [...modules].sort((left, right) => left.order - right.order);
    const prompts = ordered.map((module) => ({
      identifier: module.id,
      name: module.name,
      content: module.content,
      role: "system",
      system_prompt: module.position === "system",
      lunemir_position: module.position,
      marker: false,
      priority: module.priority,
    }));
    const payload = {
      ...preset.raw,
      name: preset.name,
      prompts,
      prompt_order: [{ character_id: 100001, order: ordered.map((module) => ({ identifier: module.id, enabled: module.enabled })) }],
      ...(preset.modelPatch.temperature !== undefined ? { temperature: preset.modelPatch.temperature } : {}),
      ...(preset.modelPatch.maxTokens !== undefined ? { openai_max_tokens: preset.modelPatch.maxTokens } : {}),
      ...(preset.modelPatch.contextLimit !== undefined ? { openai_max_context: preset.modelPatch.contextLimit } : {}),
      lunemir_output_renderer: normalizeOutputRenderer(preset.outputRenderer),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${preset.name.replace(/[\\/:*?"<>|]/g, "-") || "lunemir-preset"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function activatePreset(presetId: string) {
    const preset = presets.find((item) => item.id === presetId) ?? null;
    await applyPresetRecord(preset);
  }

  function syncModelProfileList(profiles = modelProfiles, activeId = activeModelProfileId, config = modelConfig) {
    const now = new Date().toISOString();
    return profiles.map((profile) => profile.id === activeId ? { ...profile, config: normalizeModelConfig(config), updatedAt: now } : profile);
  }

  function syncImageProfileList(profiles = imageModelProfiles, activeId = activeImageModelProfileId, config = imageModelConfig) {
    const now = new Date().toISOString();
    return profiles.map((profile) => profile.id === activeId ? { ...profile, config: normalizeImageModelConfig(config), updatedAt: now } : profile);
  }

  async function persistProviderProfiles(
    nextModelProfiles: ModelProfile[],
    nextModelProfileId: string,
    nextModelConfig: ModelConfig,
    nextImageProfiles: ImageModelProfile[],
    nextImageProfileId: string,
  ) {
    const settings = await getSettings();
    await saveSettings({
      ...settings,
      model: normalizeModelConfig(nextModelConfig),
      modelProfiles: nextModelProfiles,
      activeModelProfileId: nextModelProfileId,
      imageModelProfiles: nextImageProfiles,
      activeImageModelProfileId: nextImageProfileId,
      updatedAt: new Date().toISOString(),
    });
  }

  function updateModelConfig(nextConfig: ModelConfig) {
    const normalized = normalizeModelConfig(nextConfig);
    const modelListChanged = normalized.baseUrl !== modelConfig.baseUrl || normalized.modelsPath !== modelConfig.modelsPath;
    const connectionChanged = modelListChanged || normalized.chatCompletionsPath !== modelConfig.chatCompletionsPath;
    setModelConfig(normalized);
    setModelProfiles((profiles) => syncModelProfileList(profiles, activeModelProfileId, normalized));
    if (modelListChanged) setAvailableModels([]);
    if (connectionChanged) setConnectionStatus("idle");
  }

  function updateApiKey(value: string) {
    setModelApiKeys((keys) => ({ ...keys, [activeModelProfileId]: value }));
    setConnectionStatus("idle");
  }

  function renameModelProfile(name: string) {
    setModelProfiles((profiles) => profiles.map((profile) => profile.id === activeModelProfileId ? { ...profile, name, updatedAt: new Date().toISOString() } : profile));
  }

  async function selectModelProfile(profileId: string) {
    const synced = syncModelProfileList();
    const target = synced.find((profile) => profile.id === profileId);
    if (!target) return;
    setModelProfiles(synced);
    setActiveModelProfileId(target.id);
    setModelConfig(target.config);
    setAvailableModels([]);
    setConnectionStatus("idle");
    await persistProviderProfiles(synced, target.id, target.config, syncImageProfileList(), activeImageModelProfileId);
  }

  async function createModelProfile() {
    const now = new Date().toISOString();
    const synced = syncModelProfileList();
    const next: ModelProfile = {
      id: createId("model-profile"),
      name: `语言接口 ${synced.length + 1}`,
      config: { ...DEFAULT_MODEL_CONFIG, temperature: modelConfig.temperature, maxTokens: modelConfig.maxTokens, contextLimit: modelConfig.contextLimit },
      createdAt: now,
      updatedAt: now,
    };
    const nextProfiles = [...synced, next];
    setModelProfiles(nextProfiles);
    setActiveModelProfileId(next.id);
    setModelConfig(next.config);
    setAvailableModels([]);
    setConnectionStatus("idle");
    await persistProviderProfiles(nextProfiles, next.id, next.config, syncImageProfileList(), activeImageModelProfileId);
  }

  async function deleteModelProfile() {
    if (modelProfiles.length <= 1) {
      setRuntimeError("至少保留一个语言模型接口预设。");
      return;
    }
    const remaining = modelProfiles.filter((profile) => profile.id !== activeModelProfileId);
    const next = remaining[0];
    setModelProfiles(remaining);
    setActiveModelProfileId(next.id);
    setModelConfig(next.config);
    setAvailableModels([]);
    setConnectionStatus("idle");
    await deleteProviderApiKey(activeModelProfileId);
    await persistProviderProfiles(remaining, next.id, next.config, syncImageProfileList(), activeImageModelProfileId);
  }

  async function saveModel() {
    const nextProfiles = syncModelProfileList();
    setModelProfiles(nextProfiles);
    await saveProviderApiKey(activeModelProfileId, apiKey);
    await persistProviderProfiles(nextProfiles, activeModelProfileId, modelConfig, syncImageProfileList(), activeImageModelProfileId);
    setRuntimeError("");
  }

  function updateImageModelConfig(nextConfig: ImageModelConfig) {
    const normalized = normalizeImageModelConfig(nextConfig);
    const modelListChanged = normalized.baseUrl !== imageModelConfig.baseUrl || normalized.modelsPath !== imageModelConfig.modelsPath;
    const connectionChanged = modelListChanged || normalized.generationsPath !== imageModelConfig.generationsPath;
    setImageModelConfig(normalized);
    setImageModelProfiles((profiles) => syncImageProfileList(profiles, activeImageModelProfileId, normalized));
    if (modelListChanged) setAvailableImageModels([]);
    if (connectionChanged) setImageConnectionStatus("idle");
  }

  function updateImageApiKey(value: string) {
    setImageApiKeys((keys) => ({ ...keys, [activeImageModelProfileId]: value }));
    setImageConnectionStatus("idle");
  }

  function renameImageModelProfile(name: string) {
    setImageModelProfiles((profiles) => profiles.map((profile) => profile.id === activeImageModelProfileId ? { ...profile, name, updatedAt: new Date().toISOString() } : profile));
  }

  async function selectImageModelProfile(profileId: string) {
    const synced = syncImageProfileList();
    const target = synced.find((profile) => profile.id === profileId);
    if (!target) return;
    setImageModelProfiles(synced);
    setActiveImageModelProfileId(target.id);
    setImageModelConfig(target.config);
    setAvailableImageModels([]);
    setImageConnectionStatus("idle");
    await persistProviderProfiles(syncModelProfileList(), activeModelProfileId, modelConfig, synced, target.id);
  }

  async function createImageModelProfile() {
    const now = new Date().toISOString();
    const synced = syncImageProfileList();
    const next: ImageModelProfile = {
      id: createId("image-profile"),
      name: `生图接口 ${synced.length + 1}`,
      config: { ...DEFAULT_IMAGE_MODEL_CONFIG },
      createdAt: now,
      updatedAt: now,
    };
    const nextProfiles = [...synced, next];
    setImageModelProfiles(nextProfiles);
    setActiveImageModelProfileId(next.id);
    setImageModelConfig(next.config);
    setAvailableImageModels([]);
    setImageConnectionStatus("idle");
    await persistProviderProfiles(syncModelProfileList(), activeModelProfileId, modelConfig, nextProfiles, next.id);
  }

  async function deleteImageModelProfile() {
    if (imageModelProfiles.length <= 1) {
      setRuntimeError("至少保留一个生图接口预设。");
      return;
    }
    const remaining = imageModelProfiles.filter((profile) => profile.id !== activeImageModelProfileId);
    const next = remaining[0];
    setImageModelProfiles(remaining);
    setActiveImageModelProfileId(next.id);
    setImageModelConfig(next.config);
    setAvailableImageModels([]);
    setImageConnectionStatus("idle");
    await deleteProviderApiKey(activeImageModelProfileId);
    await persistProviderProfiles(syncModelProfileList(), activeModelProfileId, modelConfig, remaining, next.id);
  }

  async function saveImageModel() {
    const nextProfiles = syncImageProfileList();
    setImageModelProfiles(nextProfiles);
    await saveProviderApiKey(activeImageModelProfileId, imageApiKey);
    await persistProviderProfiles(syncModelProfileList(), activeModelProfileId, modelConfig, nextProfiles, activeImageModelProfileId);
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

  async function savePhoneWallpaper(file: File) {
    if (!file.type.startsWith("image/")) {
      setRuntimeError("请选择 JPG、PNG、WebP 等图片文件作为手机壁纸。");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setRuntimeError("手机壁纸不能超过 8 MB。");
      return;
    }
    try {
      const phoneWallpaperImage = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("无法读取手机壁纸。"));
        reader.onerror = () => reject(reader.error ?? new Error("无法读取手机壁纸。"));
        reader.readAsDataURL(file);
      });
      await saveAppearance({ ...appearance, phoneWallpaper: "custom", phoneWallpaperImage });
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "无法保存手机壁纸。");
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

  async function testImageConnection() {
    setImageConnectionStatus("testing");
    setRuntimeError("");
    try {
      const models = await testModelConnection(imageModelConfig, imageApiKey);
      setAvailableImageModels(models);
      setImageConnectionStatus("connected");
      await saveImageModel();
    } catch (error) {
      setImageConnectionStatus("error");
      setRuntimeError(error instanceof Error ? error.message : "生图接口连接测试失败。");
    }
  }

  async function generateImage(prompt: string) {
    setRuntimeError("");
    setImageGenerationStatus("generating");
    try {
      const result = await requestGeneratedImage({ config: imageModelConfig, apiKey: imageApiKey, prompt });
      setGeneratedImage(result);
      setImageGenerationStatus("complete");
      return true;
    } catch (error) {
      setImageGenerationStatus("error");
      setRuntimeError(error instanceof Error ? error.message : "生图失败。");
      return false;
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
    lorebookAssignments,
    personas,
    activePersona,
    personaAssignments,
    presets,
    activePreset,
    conversations,
    allConversations,
    activeConversation: conversation,
    messages,
    storyEvents,
    allStoryEvents,
    storyState: conversation && activeCharacter ? normalizeStoryState(conversation.storyState, activeCharacter, conversation.createdAt) : null,
    unreadPhoneEvents: allStoryEvents.filter((event) => event.status === "committed" && event.eventType === "phone_message_received" && !event.readAt).length,
    phoneEventStatus,
    phoneEventMessage,
    streaming,
    runtimeError,
    clearRuntimeError: () => setRuntimeError(""),
    contextReport,
    appearance,
    previewAppearance,
    saveAppearance,
    saveCustomBackground,
    savePhoneWallpaper,
    modelConfig,
    effectiveModelConfig,
    setModelConfig: updateModelConfig,
    modelProfiles,
    activeModelProfileId,
    selectModelProfile,
    createModelProfile,
    deleteModelProfile,
    renameModelProfile,
    apiKey,
    setApiKey: updateApiKey,
    connectionStatus,
    availableModels,
    imageModelConfig,
    setImageModelConfig: updateImageModelConfig,
    imageModelProfiles,
    activeImageModelProfileId,
    selectImageModelProfile,
    createImageModelProfile,
    deleteImageModelProfile,
    renameImageModelProfile,
    imageApiKey,
    setImageApiKey: updateImageApiKey,
    imageConnectionStatus,
    availableImageModels,
    imageGenerationStatus,
    generatedImage,
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
    applyOpeningGreeting,
    branchConversation,
    renameConversation,
    deleteConversation,
    createCheckpoint,
    addMemoryCandidate,
    approveMemory: (memoryId: string) => setMemoryStatus(memoryId, "approved"),
    removeMemory: (memoryId: string) => setMemoryStatus(memoryId, "remove"),
    saveAuthorNote,
    saveStorySummary,
    generateStorySummaryDraft,
    toggleLorebookAssignment,
    saveLorebookProfile,
    saveCharacterLorebook,
    duplicateLorebook,
    deleteLorebookProfile,
    downloadLorebook,
    savePersonaProfile,
    activatePersona,
    duplicatePersona,
    deletePersonaProfile,
    activatePreset,
    savePresetProfile,
    duplicatePreset,
    deletePresetProfile,
    downloadPreset,
    sendMessage,
    editMessage,
    deleteMessage,
    regenerateLastReply,
    continueLastReply,
    selectMessageAlternative,
    requestPhoneEvent,
    sendPhoneMessage,
    sendPhoneMessageToStory,
    ensurePhoneStory,
    markPhoneEventsRead,
    saveStoryState,
    advanceStoryTime,
    revertStoryEvent,
    stopGeneration: () => abortRef.current?.abort(),
    saveModel,
    testConnection,
    saveImageModel,
    testImageConnection,
    generateImage,
    downloadBackup,
    downloadConversation,
    restoreFromBackup,
  };
}
