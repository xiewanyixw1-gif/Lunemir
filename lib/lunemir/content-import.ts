import { normalizeCharacterCard, normalizeLorebookEntries, parseCharacterFile } from "./character-import";
import { createId } from "./defaults";
import type { ContentImportPreview, LorebookRecord, PresetRecord } from "./types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function fileLabel(sourceName: string) {
  return sourceName.replace(/\.json$/i, "").replace(/[_-]+/g, " ").trim() || "Imported content";
}

function looksLikeCharacter(raw: UnknownRecord) {
  const data = Object.keys(asRecord(raw.data)).length ? asRecord(raw.data) : raw;
  return Boolean(
    raw.spec
    || (asString(data.name) && ["description", "personality", "scenario", "first_mes"].some((key) => key in data)),
  );
}

function normalizeStandaloneLorebook(raw: UnknownRecord, sourceName: string): ContentImportPreview {
  const entries = normalizeLorebookEntries(raw.entries);
  if (entries.length === 0) throw new Error("世界书没有可导入的 entries 条目。");
  const now = new Date().toISOString();
  const record: LorebookRecord = {
    id: createId("lorebook"),
    schemaVersion: 1,
    name: asString(raw.name) || fileLabel(sourceName),
    sourceName,
    entries,
    raw,
    createdAt: now,
    updatedAt: now,
  };
  const disabled = entries.filter((entry) => !entry.enabled).length;
  return {
    kind: "lorebook",
    record,
    warnings: disabled ? [`包含 ${disabled} 个已停用条目，导入后会保持停用。`] : [],
    detectedFormat: "WORLD INFO · JSON",
    summary: `${entries.length} 个条目 · ${entries.filter((entry) => entry.constant).length} 个常驻`,
  };
}

function normalizePreset(raw: UnknownRecord, sourceName: string): ContentImportPreview {
  const prompts = Array.isArray(raw.prompts) ? raw.prompts.map(asRecord) : [];
  const orderGroups = Array.isArray(raw.prompt_order) ? raw.prompt_order.map(asRecord) : [];
  const preferredOrder = orderGroups.find((group) => group.character_id === 100001) ?? orderGroups[0];
  const enabledOrder = new Map(
    (Array.isArray(preferredOrder?.order) ? preferredOrder.order : [])
      .map(asRecord)
      .map((entry) => [asString(entry.identifier), entry.enabled !== false]),
  );
  const enabledPrompts = prompts.filter((prompt) => {
    const identifier = asString(prompt.identifier);
    return prompt.marker !== true
      && asString(prompt.content).trim()
      && enabledOrder.get(identifier) !== false;
  });
  const postHistoryInstructions = enabledPrompts
    .filter((prompt) => asString(prompt.identifier) === "jailbreak")
    .map((prompt) => asString(prompt.content))
    .join("\n\n");
  const systemPrompt = enabledPrompts
    .filter((prompt) => asString(prompt.identifier) !== "jailbreak")
    .map((prompt) => asString(prompt.content))
    .join("\n\n");
  const temperature = asNumber(raw.temperature);
  const maxTokens = asNumber(raw.openai_max_tokens ?? raw.max_tokens);
  const contextLimit = asNumber(raw.openai_max_context ?? raw.max_context);
  const modelPatch = {
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(contextLimit !== undefined ? { contextLimit } : {}),
  };
  if (!systemPrompt && Object.keys(modelPatch).length === 0) {
    throw new Error("没有在预设中找到提示词或支持的采样参数。");
  }
  const now = new Date().toISOString();
  const record: PresetRecord = {
    id: createId("preset"),
    schemaVersion: 1,
    name: asString(raw.name) || fileLabel(sourceName),
    sourceName,
    systemPrompt,
    postHistoryInstructions,
    modelPatch,
    raw,
    createdAt: now,
    updatedAt: now,
  };
  return {
    kind: "preset",
    record,
    warnings: prompts.length === 0 ? ["该预设没有 prompts 数组，仅会应用采样参数。"] : [],
    detectedFormat: "CHAT PRESET · JSON",
    summary: `${enabledPrompts.length} 段提示词 · ${Object.keys(modelPatch).length} 个模型参数`,
  };
}

export async function parseContentFile(file: File): Promise<ContentImportPreview> {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("文件超过 20 MB，请移除过大的内嵌资源后重试。");
  }
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".png") || file.type === "image/png") {
    const preview = await parseCharacterFile(file);
    return {
      kind: "character",
      record: preview.character,
      warnings: preview.warnings,
      detectedFormat: preview.detectedSpec,
      summary: preview.character.description.slice(0, 100) || "没有角色描述",
    };
  }
  if (!lowerName.endsWith(".json") && file.type !== "application/json") {
    throw new Error("暂时只支持 PNG 与 JSON 文件。");
  }

  const raw = asRecord(JSON.parse(await file.text()) as unknown);
  if (looksLikeCharacter(raw)) {
    const preview = normalizeCharacterCard(raw, file.name, "json");
    return {
      kind: "character",
      record: preview.character,
      warnings: preview.warnings,
      detectedFormat: preview.detectedSpec,
      summary: preview.character.description.slice(0, 100) || "没有角色描述",
    };
  }
  if (raw.entries && !raw.prompts) return normalizeStandaloneLorebook(raw, file.name);
  if (raw.prompts || "openai_max_context" in raw || "openai_max_tokens" in raw || "chat_completion_source" in raw) {
    return normalizePreset(raw, file.name);
  }
  throw new Error("无法识别文件内容。请选择角色卡、世界书或聊天预设 JSON。");
}
