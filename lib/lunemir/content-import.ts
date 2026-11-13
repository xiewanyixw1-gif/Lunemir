import { normalizeCharacterCard, normalizeLorebookEntries, parseCharacterFile } from "./character-import";
import { createId } from "./defaults";
import { normalizeImportedOutputRenderer, normalizeImportedPromptFilters } from "./output-renderer";
import type { ContentImportPreview, LorebookRecord, PresetPromptMarker, PresetRecord, PromptModule } from "./types";

type UnknownRecord = Record<string, unknown>;

const PRESET_MARKERS = new Set<PresetPromptMarker>([
  "personaDescription",
  "worldInfoBefore",
  "charDescription",
  "charPersonality",
  "worldInfoAfter",
  "scenario",
  "dialogueExamples",
  "chatHistory",
]);

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
    || (asString(data.name) && ["description", "personality", "scenario", "first_mes", "first_message", "firstMessage", "greeting", "greetings"].some((key) => key in data)),
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
  const orderEntries = (Array.isArray(preferredOrder?.order) ? preferredOrder.order : []).map(asRecord);
  const orderByIdentifier = new Map(orderEntries.map((entry, index) => [asString(entry.identifier), {
    enabled: entry.enabled !== false,
    order: index,
  }]));
  const modules = prompts
    .filter((prompt) => {
      const identifier = asString(prompt.identifier) as PresetPromptMarker;
      return asString(prompt.content).trim() || (prompt.marker === true && PRESET_MARKERS.has(identifier));
    })
    .map((prompt, index) => {
      const identifier = asString(prompt.identifier);
      const orderEntry = orderByIdentifier.get(identifier);
      const importedRole = asString(prompt.role);
      const marker = prompt.marker === true && PRESET_MARKERS.has(identifier as PresetPromptMarker)
        ? identifier as PresetPromptMarker
        : undefined;
      return {
        id: identifier ? `${identifier}_${index}` : createId("prompt"),
        name: asString(prompt.name) || identifier || `提示词 ${index + 1}`,
        content: asString(prompt.content).trim(),
        enabled: orderEntry?.enabled ?? true,
        position: identifier === "jailbreak" || asString(prompt.lunemir_position) === "post_history"
          ? "post_history" as const
          : "system" as const,
        role: (importedRole === "user" || importedRole === "assistant" ? importedRole : "system") as PromptModule["role"],
        priority: asNumber(prompt.priority) ?? 0,
        order: orderEntry?.order ?? orderEntries.length + index,
        ...(marker ? { marker } : {}),
      };
    })
    .sort((left, right) => left.order - right.order);
  const enabledPrompts = modules.filter((module) => module.enabled);
  const postHistoryInstructions = enabledPrompts
    .filter((module) => !module.marker && module.position === "post_history" && module.role === "system")
    .map((module) => module.content)
    .join("\n\n");
  const systemPrompt = enabledPrompts
    .filter((module) => !module.marker && module.position === "system" && module.role === "system")
    .map((module) => module.content)
    .join("\n\n");
  const temperature = asNumber(raw.temperature);
  const maxTokens = asNumber(raw.openai_max_tokens ?? raw.max_tokens);
  const contextLimit = asNumber(raw.openai_max_context ?? raw.max_context);
  const modelPatch = {
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(contextLimit !== undefined ? { contextLimit } : {}),
  };
  const outputRenderer = normalizeImportedOutputRenderer(raw);
  const promptFilters = normalizeImportedPromptFilters(raw);
  if (modules.length === 0 && Object.keys(modelPatch).length === 0 && outputRenderer.regexRules.length === 0 && promptFilters.length === 0) {
    throw new Error("没有在预设中找到提示词、Regex 规则或支持的采样参数。");
  }
  const now = new Date().toISOString();
  const record: PresetRecord = {
    id: createId("preset"),
    schemaVersion: 1,
    name: asString(raw.name ?? raw.scriptName) || fileLabel(sourceName),
    sourceName,
    systemPrompt,
    postHistoryInstructions,
    modules,
    promptFilters,
    modelPatch,
    outputRenderer,
    raw,
    createdAt: now,
    updatedAt: now,
  };
  return {
    kind: "preset",
    record,
    warnings: prompts.length === 0 && promptFilters.length === 0 ? ["该预设没有 prompts 数组，仅会应用采样参数或输出 Regex。"] : [],
    detectedFormat: asString(raw.findRegex ?? raw.find_regex) ? "PROMPT FILTER · REGEX" : "CHAT PRESET · JSON",
    summary: `${enabledPrompts.length}/${modules.length} 段提示词启用 · ${promptFilters.length} 条历史过滤 · ${outputRenderer.regexRules.length} 条输出规则`,
  };
}

export function isPromptFilterOnlyPreset(preset: PresetRecord) {
  return Boolean(
    preset.promptFilters?.length
    && (preset.modules?.length ?? 0) === 0
    && Object.keys(preset.modelPatch).length === 0
    && (preset.outputRenderer?.regexRules.length ?? 0) === 0,
  );
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
  if (raw.prompts || raw.findRegex || raw.find_regex || "openai_max_context" in raw || "openai_max_tokens" in raw || "chat_completion_source" in raw) {
    return normalizePreset(raw, file.name);
  }
  throw new Error("无法识别文件内容。请选择角色卡、世界书或聊天预设 JSON。");
}
