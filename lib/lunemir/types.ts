export type Role = "user" | "assistant";

export type LorebookEntry = {
  id: string;
  name: string;
  keys: string[];
  secondaryKeys: string[];
  content: string;
  enabled: boolean;
  constant: boolean;
  selective: boolean;
  priority: number;
  insertionOrder: number;
  caseSensitive: boolean;
  scanDepth?: number;
  probability?: number;
  useProbability?: boolean;
  recursive?: boolean;
  tokenBudget?: number;
  extensions: Record<string, unknown>;
};

export type CharacterRecord = {
  id: string;
  schemaVersion: 1;
  spec: "v1" | "v2" | "v3" | "unknown";
  specVersion: string;
  sourceFormat: string;
  sourceName: string;
  name: string;
  nickname: string;
  signature: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  exampleMessages: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  alternateGreetings: string[];
  tags: string[];
  creator: string;
  characterVersion: string;
  creatorNotes: string;
  avatarDataUrl?: string;
  lorebookName: string;
  lorebookEntries: LorebookEntry[];
  embeddedRendererEnabled?: boolean;
  extensions: Record<string, unknown>;
  raw: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CharacterEditorValues = Pick<CharacterRecord,
  | "name"
  | "nickname"
  | "signature"
  | "description"
  | "personality"
  | "scenario"
  | "firstMessage"
  | "alternateGreetings"
  | "exampleMessages"
  | "systemPrompt"
  | "postHistoryInstructions"
  | "tags"
  | "creator"
  | "characterVersion"
  | "creatorNotes"
  | "avatarDataUrl"
  | "embeddedRendererEnabled"
>;

export type LorebookRecord = {
  id: string;
  schemaVersion: 1;
  name: string;
  sourceName: string;
  entries: LorebookEntry[];
  raw: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type LorebookEditorValues = Pick<LorebookRecord, "name" | "entries">;

export type PersonaRecord = {
  id: string;
  schemaVersion: 1;
  name: string;
  description: string;
  avatarDataUrl?: string;
  appearance?: string;
  personality?: string;
  identity?: string;
  occupation?: string;
  background?: string;
  relationships?: string;
  currentState?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type PersonaEditorValues = Pick<PersonaRecord,
  | "name"
  | "description"
  | "avatarDataUrl"
  | "appearance"
  | "personality"
  | "identity"
  | "occupation"
  | "background"
  | "relationships"
  | "currentState"
  | "notes"
>;

export type PromptModule = {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  position: "system" | "post_history";
  role: "system" | Role;
  priority: number;
  order: number;
};

export type OutputRegexRule = {
  id: string;
  name: string;
  pattern: string;
  replacement: string;
  flags: string;
  enabled: boolean;
  scope: "assistant" | "all";
  minDepth?: number;
  maxDepth?: number;
};

export type PromptFilterRule = OutputRegexRule;

export type OutputRendererConfig = {
  enabled: boolean;
  markdown: boolean;
  isolatedHtml: boolean;
  theater: boolean;
  widgets: boolean;
  theaterTheme: "glass" | "minimal" | "paper";
  regexRules: OutputRegexRule[];
};

export type PresetRecord = {
  id: string;
  schemaVersion: 1;
  name: string;
  sourceName: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  modules?: PromptModule[];
  promptFilters?: PromptFilterRule[];
  modelPatch: Partial<Pick<ModelConfig, "temperature" | "maxTokens" | "contextLimit">>;
  outputRenderer?: OutputRendererConfig;
  raw: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PresetEditorValues = Pick<PresetRecord, "name" | "modelPatch"> & {
  modules: PromptModule[];
  promptFilters: PromptFilterRule[];
  outputRenderer: OutputRendererConfig;
};

export type StoredMessage = {
  id: string;
  role: Role;
  content: string;
  reasoning?: string;
  finishReason?: string;
  continuationCount?: number;
  createdAt: string;
  status?: "complete" | "streaming" | "stopped" | "truncated" | "error";
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  tokenCountEstimated?: boolean;
  editedAt?: string;
  alternatives?: string[];
  activeAlternative?: number;
};

export type ConversationCheckpoint = {
  id: string;
  label: string;
  messageId?: string;
  createdAt: string;
};

export type ConversationMemory = {
  id: string;
  content: string;
  sourceMessageId?: string;
  status: "candidate" | "approved";
  createdAt: string;
};

export type AuthorNote = {
  content: string;
  enabled: boolean;
  position: "system" | "in_history" | "post_history";
  depth: number;
  expiresAfterMessageCount?: number;
  updatedAt: string;
};

export type StorySummary = {
  content: string;
  status: "draft" | "confirmed";
  coveredMessageCount: number;
  updatedAt: string;
};

export type StoryState = {
  currentTime: string;
  location: string;
  weather: string;
  scene: string;
  npcInitiative: number;
  cooldownMinutes: number;
  lastNpcActionAt?: string;
  updatedAt: string;
};

export type ConversationRecord = {
  id: string;
  schemaVersion: 1;
  characterId: string;
  title: string;
  messages: StoredMessage[];
  parentConversationId?: string;
  branchedFromMessageId?: string;
  checkpoints?: ConversationCheckpoint[];
  memories?: ConversationMemory[];
  authorNote?: AuthorNote;
  storySummary?: StorySummary;
  storyState?: StoryState;
  createdAt: string;
  updatedAt: string;
};

export type StoryEventType = "phone_message_received" | "phone_message_sent" | "time_advanced" | "story_state_changed";

export type StoryEvent = {
  id: string;
  schemaVersion: 1;
  storyId: string;
  eventType: StoryEventType;
  actorId: string;
  targetId: string;
  content: string;
  storyTime: string;
  source: "ai" | "user" | "system";
  status: "committed" | "reverted";
  createdAt: string;
  readAt?: string;
  replyToEventId?: string;
  metadata?: {
    reason?: string;
    previousStoryState?: StoryState;
    nextStoryState?: StoryState;
  };
};

export type ModelConfig = {
  baseUrl: string;
  modelsPath: string;
  chatCompletionsPath: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxTokenParam: "max_tokens" | "max_completion_tokens";
  contextLimit: number;
};

export type ModelProfile = {
  id: string;
  name: string;
  config: ModelConfig;
  createdAt: string;
  updatedAt: string;
};

export type ImageModelConfig = {
  baseUrl: string;
  modelsPath: string;
  generationsPath: string;
  model: string;
  size: string;
  quality: string;
  style: string;
};

export type ImageModelProfile = {
  id: string;
  name: string;
  config: ImageModelConfig;
  createdAt: string;
  updatedAt: string;
};

export type GeneratedImage = {
  imageUrl: string;
  revisedPrompt?: string;
};

export type AppearanceSettings = {
  theme: "moon" | "aurora" | "rose";
  /** @deprecated Kept for v0.15 appearance backups. */
  blur: number;
  /** @deprecated Kept for v0.15 appearance backups. */
  opacity: number;
  radius: number;
  /** @deprecated Kept for v0.15 appearance backups. */
  glassMode: "full" | "messages";
  backgroundMode: "gradient" | "character" | "custom";
  backgroundImage?: string;
  readingStyle: "cinematic" | "editorial" | "reader-glass";
  messageStyle: "bubble" | "soft-card" | "novel-flow";
  glassScope: "fullscreen" | "messages" | "chrome-only" | "none";
  glassOpacity: number;
  glassBlur: number;
  glassBorderOpacity: number;
  glassHighlight: number;
  glassShadow: number;
  backgroundBrightness: number;
  backgroundBlur: number;
  backgroundOverlay: number;
  backgroundVignette: number;
  backgroundFit: "cover" | "contain";
  backgroundScale: number;
  backgroundPositionX: number;
  backgroundPositionY: number;
  showCharacterAvatar: boolean;
  showUserAvatar: boolean;
  showCharacterName: boolean;
  showUserName: boolean;
  showTimestamp: boolean;
  avatarLayout: "side" | "header";
  avatarShape: "circle" | "square" | "rounded";
  avatarSize: number;
  avatarGap: number;
  fontFamily: "sans" | "serif" | "system";
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  paragraphSpacing: number;
  messageMaxWidth: number;
  mobileReadingInset: number;
  phoneScale: number;
  phoneWallpaper: "moon" | "aurora" | "rose" | "custom";
  phoneWallpaperImage?: string;
  phoneButtonPosition?: { x: number; y: number };
  phonePanelPosition?: { x: number; y: number };
};

export type PersistedSettings = {
  key: "app";
  schemaVersion: 1;
  activeCharacterId?: string;
  activePersonaId?: string;
  activePresetId?: string;
  activeConversationIds?: Record<string, string>;
  personaAssignments?: Record<string, string>;
  lorebookAssignments?: Record<string, string[]>;
  appearance?: AppearanceSettings;
  model: ModelConfig;
  modelProfiles?: ModelProfile[];
  activeModelProfileId?: string;
  imageModelProfiles?: ImageModelProfile[];
  activeImageModelProfileId?: string;
  updatedAt: string;
};

export type ImportPreview = {
  character: CharacterRecord;
  warnings: string[];
  detectedSpec: string;
};

export type ContentImportPreview = {
  kind: "character";
  record: CharacterRecord;
  warnings: string[];
  detectedFormat: string;
  summary: string;
} | {
  kind: "lorebook";
  record: LorebookRecord;
  warnings: string[];
  detectedFormat: string;
  summary: string;
} | {
  kind: "preset";
  record: PresetRecord;
  warnings: string[];
  detectedFormat: string;
  summary: string;
};

export type ContextSegment = {
  id: string;
  label: string;
  detail: string;
  estimatedTokens: number;
};

export type ContextPromptMessage = {
  id: string;
  role: "system" | Role;
  label: string;
  content: string;
  estimatedTokens: number;
};

export type ContextPresetModule = {
  id: string;
  name: string;
  position: PromptModule["position"];
  priority: number;
  estimatedTokens: number;
};

export type MatchedLore = {
  entry: LorebookEntry;
  reason: string;
  content: string;
};

export type ContextReport = {
  estimatedTokens: number;
  limit: number;
  health: number;
  segments: ContextSegment[];
  matchedLore: MatchedLore[];
  loreStats: {
    total: number;
    enabled: number;
    matched: number;
  };
  presetModules: ContextPresetModule[];
  promptMessages: ContextPromptMessage[];
  warnings: string[];
};

export type ModelMessage = {
  role: "system" | Role;
  content: string;
};

export type CompiledContext = {
  messages: ModelMessage[];
  report: ContextReport;
};

export type LunemirBackup = {
  format: "lunemir-backup";
  schemaVersion: 6;
  exportedAt: string;
  characters: CharacterRecord[];
  conversations: ConversationRecord[];
  lorebooks: LorebookRecord[];
  personas: PersonaRecord[];
  presets: PresetRecord[];
  storyEvents: StoryEvent[];
  settings?: PersistedSettings;
};
