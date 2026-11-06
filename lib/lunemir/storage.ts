import { DEFAULT_MODEL_CONFIG } from "./defaults";
import type {
  CharacterRecord,
  ConversationRecord,
  LorebookRecord,
  LunemirBackup,
  PersonaRecord,
  PersistedSettings,
  PresetRecord,
  StoryEvent,
} from "./types";

const DATABASE_NAME = "lunemir";
const DATABASE_VERSION = 4;
const CHARACTER_STORE = "characters";
const CONVERSATION_STORE = "conversations";
const SETTINGS_STORE = "settings";
const LOREBOOK_STORE = "lorebooks";
const PERSONA_STORE = "personas";
const PRESET_STORE = "presets";
const STORY_EVENT_STORE = "storyEvents";

let databasePromise: Promise<IDBDatabase> | null = null;

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("本地数据库操作失败。"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("本地数据库事务失败。"));
    transaction.onabort = () => reject(transaction.error ?? new Error("本地数据库事务已取消。"));
  });
}

export function openLunemirDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("当前浏览器不支持 IndexedDB。"));
  }

  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.onupgradeneeded = (event) => {
        const database = request.result;
        if (!database.objectStoreNames.contains(CHARACTER_STORE)) {
          database.createObjectStore(CHARACTER_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(CONVERSATION_STORE)) {
          const conversations = database.createObjectStore(CONVERSATION_STORE, { keyPath: "id" });
          conversations.createIndex("characterId", "characterId", { unique: false });
        } else if ((event as IDBVersionChangeEvent).oldVersion < 3) {
          const conversations = request.transaction?.objectStore(CONVERSATION_STORE);
          if (conversations?.indexNames.contains("characterId")) conversations.deleteIndex("characterId");
          conversations?.createIndex("characterId", "characterId", { unique: false });
        }
        if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
          database.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
        }
        if (!database.objectStoreNames.contains(LOREBOOK_STORE)) {
          database.createObjectStore(LOREBOOK_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(PERSONA_STORE)) {
          database.createObjectStore(PERSONA_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(PRESET_STORE)) {
          database.createObjectStore(PRESET_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(STORY_EVENT_STORE)) {
          const storyEvents = database.createObjectStore(STORY_EVENT_STORE, { keyPath: "id" });
          storyEvents.createIndex("storyId", "storyId", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("无法打开 Lunemir 本地数据库。"));
      request.onblocked = () => reject(new Error("数据库升级被其他 Lunemir 页面阻止，请关闭其他页面后重试。"));
    });
  }

  return databasePromise;
}

async function getAll<T>(storeName: string) {
  const database = await openLunemirDatabase();
  const transaction = database.transaction(storeName, "readonly");
  return requestToPromise(transaction.objectStore(storeName).getAll()) as Promise<T[]>;
}

async function put<T>(storeName: string, value: T) {
  const database = await openLunemirDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
  return value;
}

async function remove(storeName: string, key: IDBValidKey) {
  const database = await openLunemirDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
}

export function listCharacters() {
  return getAll<CharacterRecord>(CHARACTER_STORE);
}

export function saveCharacter(character: CharacterRecord) {
  return put(CHARACTER_STORE, character);
}

export function deleteCharacter(characterId: string) {
  return remove(CHARACTER_STORE, characterId);
}

export function listLorebooks() {
  return getAll<LorebookRecord>(LOREBOOK_STORE);
}

export function saveLorebook(lorebook: LorebookRecord) {
  return put(LOREBOOK_STORE, lorebook);
}

export function deleteLorebook(lorebookId: string) {
  return remove(LOREBOOK_STORE, lorebookId);
}

export function listPersonas() {
  return getAll<PersonaRecord>(PERSONA_STORE);
}

export function savePersona(persona: PersonaRecord) {
  return put(PERSONA_STORE, persona);
}

export function deletePersona(personaId: string) {
  return remove(PERSONA_STORE, personaId);
}

export function listPresets() {
  return getAll<PresetRecord>(PRESET_STORE);
}

export function savePreset(preset: PresetRecord) {
  return put(PRESET_STORE, preset);
}

export function deletePreset(presetId: string) {
  return remove(PRESET_STORE, presetId);
}

export async function listConversations(characterId: string) {
  const database = await openLunemirDatabase();
  const transaction = database.transaction(CONVERSATION_STORE, "readonly");
  const index = transaction.objectStore(CONVERSATION_STORE).index("characterId");
  return requestToPromise(index.getAll(characterId)) as Promise<ConversationRecord[]>;
}

export function listAllConversations() {
  return getAll<ConversationRecord>(CONVERSATION_STORE);
}

export function saveConversation(conversation: ConversationRecord) {
  return put(CONVERSATION_STORE, conversation);
}

export function deleteConversation(conversationId: string) {
  return remove(CONVERSATION_STORE, conversationId);
}

export async function listStoryEvents(storyId: string) {
  const database = await openLunemirDatabase();
  const transaction = database.transaction(STORY_EVENT_STORE, "readonly");
  const index = transaction.objectStore(STORY_EVENT_STORE).index("storyId");
  const events = await requestToPromise(index.getAll(storyId)) as StoryEvent[];
  return events.sort((left, right) => left.storyTime.localeCompare(right.storyTime) || left.createdAt.localeCompare(right.createdAt));
}

export async function listAllStoryEvents() {
  const events = await getAll<StoryEvent>(STORY_EVENT_STORE);
  return events.sort((left, right) => left.storyTime.localeCompare(right.storyTime) || left.createdAt.localeCompare(right.createdAt));
}

export function saveStoryEvent(event: StoryEvent) {
  return put(STORY_EVENT_STORE, event);
}

export async function deleteStoryEvents(storyId: string) {
  const database = await openLunemirDatabase();
  const readTransaction = database.transaction(STORY_EVENT_STORE, "readonly");
  const keys = await requestToPromise(readTransaction.objectStore(STORY_EVENT_STORE).index("storyId").getAllKeys(storyId));
  const transaction = database.transaction(STORY_EVENT_STORE, "readwrite");
  const store = transaction.objectStore(STORY_EVENT_STORE);
  keys.forEach((key) => store.delete(key));
  await transactionDone(transaction);
}

export async function getSettings(): Promise<PersistedSettings> {
  const database = await openLunemirDatabase();
  const transaction = database.transaction(SETTINGS_STORE, "readonly");
  const existing = await requestToPromise(transaction.objectStore(SETTINGS_STORE).get("app")) as PersistedSettings | undefined;

  return existing ?? {
    key: "app",
    schemaVersion: 1,
    model: DEFAULT_MODEL_CONFIG,
    updatedAt: new Date().toISOString(),
  };
}

export function saveSettings(settings: PersistedSettings) {
  return put(SETTINGS_STORE, settings);
}

export async function createBackup(): Promise<LunemirBackup> {
  const [characters, conversations, lorebooks, personas, presets, storyEvents, settings] = await Promise.all([
    listCharacters(),
    getAll<ConversationRecord>(CONVERSATION_STORE),
    listLorebooks(),
    listPersonas(),
    listPresets(),
    getAll<StoryEvent>(STORY_EVENT_STORE),
    getSettings(),
  ]);

  return {
    format: "lunemir-backup",
    schemaVersion: 6,
    exportedAt: new Date().toISOString(),
    characters,
    conversations,
    lorebooks,
    personas,
    presets,
    storyEvents,
    settings,
  };
}

type RestorableBackup = Omit<LunemirBackup, "schemaVersion" | "lorebooks" | "personas" | "presets" | "storyEvents"> & {
  schemaVersion: 1 | 2 | 3 | 4 | 5 | 6;
  lorebooks?: LorebookRecord[];
  personas?: PersonaRecord[];
  presets?: PresetRecord[];
  storyEvents?: StoryEvent[];
};

function isBackup(value: unknown): value is RestorableBackup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RestorableBackup>;
  return candidate.format === "lunemir-backup"
    && (candidate.schemaVersion === 1 || candidate.schemaVersion === 2 || candidate.schemaVersion === 3 || candidate.schemaVersion === 4 || candidate.schemaVersion === 5 || candidate.schemaVersion === 6)
    && Array.isArray(candidate.characters)
    && Array.isArray(candidate.conversations);
}

export async function restoreBackup(file: File) {
  const parsed = JSON.parse(await file.text()) as unknown;
  if (!isBackup(parsed)) {
    throw new Error("这不是有效的 Lunemir 备份文件。");
  }

  const database = await openLunemirDatabase();
  const transaction = database.transaction(
    [CHARACTER_STORE, CONVERSATION_STORE, SETTINGS_STORE, LOREBOOK_STORE, PERSONA_STORE, PRESET_STORE, STORY_EVENT_STORE],
    "readwrite",
  );

  const characters = transaction.objectStore(CHARACTER_STORE);
  const conversations = transaction.objectStore(CONVERSATION_STORE);
  const settings = transaction.objectStore(SETTINGS_STORE);
  const lorebooks = transaction.objectStore(LOREBOOK_STORE);
  const personas = transaction.objectStore(PERSONA_STORE);
  const presets = transaction.objectStore(PRESET_STORE);
  const storyEvents = transaction.objectStore(STORY_EVENT_STORE);
  characters.clear();
  conversations.clear();
  settings.clear();
  lorebooks.clear();
  personas.clear();
  presets.clear();
  storyEvents.clear();
  parsed.characters.forEach((character) => characters.put(character));
  parsed.conversations.forEach((conversation) => conversations.put(conversation));
  (parsed.lorebooks ?? []).forEach((lorebook) => lorebooks.put(lorebook));
  (parsed.personas ?? []).forEach((persona) => personas.put(persona));
  (parsed.presets ?? []).forEach((preset) => presets.put(preset));
  (parsed.storyEvents ?? []).forEach((event) => storyEvents.put(event));
  if (parsed.settings) settings.put(parsed.settings);
  await transactionDone(transaction);
}
