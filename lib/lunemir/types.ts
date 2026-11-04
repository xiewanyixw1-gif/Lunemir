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
  extensions: Record<string, unknown>;
  raw: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

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

export type PersonaRecord = {
  id: string;
  schemaVersion: 1;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type PresetRecord = {
  id: string;
  schemaVersion: 1;
  name: string;
  sourceName: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  modelPatch: Partial<Pick<ModelConfig, "temperature" | "maxTokens" | "contextLimit">>;
  raw: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type StoredMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  status?: "complete" | "streaming" | "stopped" | "error";
  editedAt?: string;
};

export type ConversationRecord = {
  id: string;
  schemaVersion: 1;
  characterId: string;
  title: string;
  messages: StoredMessage[];
  createdAt: string;
  updatedAt: string;
};

export type ModelConfig = {
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextLimit: number;
};

export type PersistedSettings = {
  key: "app";
  schemaVersion: 1;
  activeCharacterId?: string;
  activePersonaId?: string;
  activePresetId?: string;
  lorebookAssignments?: Record<string, string[]>;
  model: ModelConfig;
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

export type MatchedLore = {
  entry: LorebookEntry;
  reason: string;
};

export type ContextReport = {
  estimatedTokens: number;
  limit: number;
  health: number;
  segments: ContextSegment[];
  matchedLore: MatchedLore[];
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
  schemaVersion: 2;
  exportedAt: string;
  characters: CharacterRecord[];
  conversations: ConversationRecord[];
  lorebooks: LorebookRecord[];
  personas: PersonaRecord[];
  presets: PresetRecord[];
  settings?: PersistedSettings;
};
