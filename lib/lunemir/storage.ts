import { DEFAULT_MODEL_CONFIG } from "./defaults";
import type {
  CharacterRecord,
  ConversationRecord,
  LunemirBackup,
  PersistedSettings,
} from "./types";

const DATABASE_NAME = "lunemir";
const DATABASE_VERSION = 1;
const CHARACTER_STORE = "characters";
const CONVERSATION_STORE = "conversations";
const SETTINGS_STORE = "settings";

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

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(CHARACTER_STORE)) {
          database.createObjectStore(CHARACTER_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(CONVERSATION_STORE)) {
          const conversations = database.createObjectStore(CONVERSATION_STORE, { keyPath: "id" });
          conversations.createIndex("characterId", "characterId", { unique: true });
        }
        if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
          database.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
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

export function listCharacters() {
  return getAll<CharacterRecord>(CHARACTER_STORE);
}

export function saveCharacter(character: CharacterRecord) {
  return put(CHARACTER_STORE, character);
}

export async function getConversation(characterId: string) {
  const database = await openLunemirDatabase();
  const transaction = database.transaction(CONVERSATION_STORE, "readonly");
  const index = transaction.objectStore(CONVERSATION_STORE).index("characterId");
  return requestToPromise(index.get(characterId)) as Promise<ConversationRecord | undefined>;
}

export function saveConversation(conversation: ConversationRecord) {
  return put(CONVERSATION_STORE, conversation);
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
  const [characters, conversations, settings] = await Promise.all([
    listCharacters(),
    getAll<ConversationRecord>(CONVERSATION_STORE),
    getSettings(),
  ]);

  return {
    format: "lunemir-backup",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    characters,
    conversations,
    settings,
  };
}

function isBackup(value: unknown): value is LunemirBackup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LunemirBackup>;
  return candidate.format === "lunemir-backup"
    && candidate.schemaVersion === 1
    && Array.isArray(candidate.characters)
    && Array.isArray(candidate.conversations);
}

export async function restoreBackup(file: File) {
  const parsed = JSON.parse(await file.text()) as unknown;
  if (!isBackup(parsed)) {
    throw new Error("这不是有效的 Lunemir v1 备份文件。");
  }

  const database = await openLunemirDatabase();
  const transaction = database.transaction(
    [CHARACTER_STORE, CONVERSATION_STORE, SETTINGS_STORE],
    "readwrite",
  );

  const characters = transaction.objectStore(CHARACTER_STORE);
  const conversations = transaction.objectStore(CONVERSATION_STORE);
  const settings = transaction.objectStore(SETTINGS_STORE);
  characters.clear();
  conversations.clear();
  settings.clear();
  parsed.characters.forEach((character) => characters.put(character));
  parsed.conversations.forEach((conversation) => conversations.put(conversation));
  if (parsed.settings) settings.put(parsed.settings);
  await transactionDone(transaction);
}
