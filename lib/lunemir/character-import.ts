import { createId } from "./defaults";
import type { CharacterRecord, ImportPreview, LorebookEntry } from "./types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeLorebookEntries(rawEntries: unknown): LorebookEntry[] {
  const entries = Array.isArray(rawEntries)
    ? rawEntries
    : Object.values(asRecord(rawEntries));

  return entries.map((entry, index): LorebookEntry => {
    const source = asRecord(entry);
    const order = asNumber(source.order, index);
    const defaultPriority = typeof source.order === "number" ? order : 50;
    return {
      id: String(source.id ?? source.uid ?? createId("lore")),
      name: asString(source.name) || asString(source.comment) || `条目 ${index + 1}`,
      keys: asStringArray(source.keys ?? source.key),
      secondaryKeys: asStringArray(source.secondary_keys ?? source.keysecondary),
      content: asString(source.content),
      enabled: source.enabled !== false && source.disable !== true,
      constant: source.constant === true,
      selective: source.selective === true,
      priority: asNumber(source.priority, defaultPriority),
      insertionOrder: asNumber(source.insertion_order, order),
      caseSensitive: source.case_sensitive === true || source.caseSensitive === true,
      extensions: asRecord(source.extensions),
    };
  });
}

function normalizeLorebook(data: UnknownRecord) {
  const book = asRecord(data.character_book);

  return {
    name: asString(book.name) || "角色内置世界书",
    entries: normalizeLorebookEntries(book.entries),
  };
}

export function normalizeCharacterCard(
  rawValue: unknown,
  sourceName: string,
  sourceContainer: "json" | "png",
  avatarDataUrl?: string,
): ImportPreview {
  const raw = asRecord(rawValue);
  const wrappedData = asRecord(raw.data);
  const data = Object.keys(wrappedData).length ? wrappedData : raw;
  const specName = asString(raw.spec);
  const spec = specName === "chara_card_v3" ? "v3" : specName === "chara_card_v2" ? "v2" : "v1";
  const specVersion = asString(raw.spec_version) || (spec === "v1" ? "1.0" : spec === "v2" ? "2.0" : "3.0");
  const lorebook = normalizeLorebook(data);
  const warnings: string[] = [];
  const name = asString(data.name).trim();

  if (!name) throw new Error("角色卡缺少必需的 name 字段。");
  if (!asString(data.first_mes)) warnings.push("角色卡没有首条消息，将使用空白开场。");
  if (spec === "v1") warnings.push("检测到旧版 V1 角色卡，已转换为 Lunemir 内部格式。");
  if (spec === "v3" && Number.parseFloat(specVersion) > 3) {
    warnings.push(`角色卡版本 ${specVersion} 高于当前完整验证版本，未知字段会被保留。`);
  }

  const now = new Date().toISOString();
  const character: CharacterRecord = {
    id: createId("character"),
    schemaVersion: 1,
    spec,
    specVersion,
    sourceFormat: `${spec}-${sourceContainer}`,
    sourceName,
    name,
    nickname: asString(data.nickname),
    description: asString(data.description),
    personality: asString(data.personality),
    scenario: asString(data.scenario),
    firstMessage: asString(data.first_mes),
    exampleMessages: asString(data.mes_example),
    systemPrompt: asString(data.system_prompt),
    postHistoryInstructions: asString(data.post_history_instructions),
    alternateGreetings: asStringArray(data.alternate_greetings),
    tags: asStringArray(data.tags),
    creator: asString(data.creator),
    characterVersion: asString(data.character_version),
    creatorNotes: asString(data.creator_notes),
    avatarDataUrl,
    lorebookName: lorebook.name,
    lorebookEntries: lorebook.entries,
    extensions: asRecord(data.extensions),
    raw,
    createdAt: now,
    updatedAt: now,
  };

  return {
    character,
    warnings,
    detectedSpec: `${spec.toUpperCase()} · ${sourceContainer.toUpperCase()}`,
  };
}

function decodeBase64Utf8(value: string) {
  const compact = value.replace(/\s/g, "");
  const binary = atob(compact);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function parsePngTextChunks(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => bytes[index] !== value)) {
    throw new Error("文件不是有效的 PNG 图片。");
  }

  const chunks = new Map<string, string>();
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = new TextDecoder("ascii").decode(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error("PNG 数据块长度无效。");

    if (type === "tEXt") {
      const data = bytes.subarray(dataStart, dataEnd);
      const separator = data.indexOf(0);
      if (separator > 0) {
        const keyword = new TextDecoder("latin1").decode(data.subarray(0, separator));
        const text = new TextDecoder("latin1").decode(data.subarray(separator + 1));
        chunks.set(keyword, text);
      }
    }

    offset = dataEnd + 4;
    if (type === "IEND") break;
  }

  return chunks;
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取角色头像。"));
    reader.readAsDataURL(file);
  });
}

export async function parseCharacterFile(file: File): Promise<ImportPreview> {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("文件超过 20 MB，请移除过大的内嵌资源后重试。");
  }
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".json") || file.type === "application/json") {
    const parsed = JSON.parse(await file.text()) as unknown;
    return normalizeCharacterCard(parsed, file.name, "json");
  }

  if (lowerName.endsWith(".png") || file.type === "image/png") {
    const chunks = parsePngTextChunks(await file.arrayBuffer());
    const encoded = chunks.get("ccv3") ?? chunks.get("chara");
    if (!encoded) {
      throw new Error("PNG 中没有找到 ccv3 或 chara 角色卡数据。");
    }
    const parsed = JSON.parse(decodeBase64Utf8(encoded)) as unknown;
    return normalizeCharacterCard(parsed, file.name, "png", await fileToDataUrl(file));
  }

  throw new Error("暂时只支持 PNG 与 JSON 角色卡。");
}
