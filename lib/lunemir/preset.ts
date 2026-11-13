import { createId } from "./defaults";
import type { PresetPromptMarker, PresetRecord, PromptModule } from "./types";

const RESTORABLE_PRESET_MARKERS = new Set<PresetPromptMarker>([
  "personaDescription",
  "worldInfoBefore",
  "charDescription",
  "charPersonality",
  "worldInfoAfter",
  "scenario",
  "dialogueExamples",
  "chatHistory",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function restorePresetStructureMarkers(preset?: PresetRecord | null): PromptModule[] {
  const modules = Array.isArray(preset?.modules) ? preset.modules : [];
  if (!preset) return modules;
  const prompts = Array.isArray(preset.raw?.prompts) ? preset.raw.prompts.map(asRecord) : [];
  if (prompts.length === 0) return modules;

  const orderGroups = Array.isArray(preset.raw?.prompt_order) ? preset.raw.prompt_order.map(asRecord) : [];
  const preferredOrder = orderGroups.find((group) => group.character_id === 100001) ?? orderGroups[0];
  const orderEntries = (Array.isArray(preferredOrder?.order) ? preferredOrder.order : []).map(asRecord);
  const orderByIdentifier = new Map(orderEntries.map((entry, index) => [
    typeof entry.identifier === "string" ? entry.identifier : "",
    { enabled: entry.enabled !== false, order: index },
  ]));
  const existingMarkers = new Set(modules.flatMap((module) => module.marker ? [module.marker] : []));
  const restoredMarkers = prompts.flatMap((prompt, promptIndex): PromptModule[] => {
    const identifier = typeof prompt.identifier === "string" ? prompt.identifier as PresetPromptMarker : undefined;
    if (prompt.marker !== true || !identifier || !RESTORABLE_PRESET_MARKERS.has(identifier) || existingMarkers.has(identifier)) return [];
    const orderEntry = orderByIdentifier.get(identifier);
    return [{
      id: `${identifier}_restored`,
      name: typeof prompt.name === "string" && prompt.name.trim() ? prompt.name : identifier,
      content: "",
      enabled: orderEntry?.enabled ?? true,
      position: "system",
      role: "system",
      priority: typeof prompt.priority === "number" && Number.isFinite(prompt.priority) ? prompt.priority : 0,
      order: orderEntry?.order ?? orderEntries.length + promptIndex,
      marker: identifier,
    }];
  });
  return [...modules, ...restoredMarkers].sort((left, right) => left.order - right.order || right.priority - left.priority);
}

export function createPromptModule(index: number): PromptModule {
  return {
    id: createId("prompt"),
    name: `提示词模块 ${index + 1}`,
    content: "",
    enabled: true,
    position: "system",
    role: "system",
    priority: 0,
    order: index,
  };
}

export function analyzePromptModules(modules: PromptModule[]) {
  const enabled = modules.filter((module) => module.enabled && module.content.trim());
  const enabledMarkers = modules.filter((module) => module.enabled && module.marker);
  const warnings: string[] = [];
  const names = new Map<string, number>();
  const contents = new Map<string, number>();

  enabled.forEach((module) => {
    const name = module.name.trim().toLocaleLowerCase();
    const content = module.content.trim().replaceAll(/\s+/g, " ").toLocaleLowerCase();
    if (name) names.set(name, (names.get(name) ?? 0) + 1);
    if (content) contents.set(content, (contents.get(content) ?? 0) + 1);
  });

  const duplicateNames = [...names.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  if (duplicateNames.length) warnings.push(`存在重名模块：${duplicateNames.slice(0, 3).join("、")}`);
  const duplicateContents = [...contents.values()].filter((count) => count > 1).length;
  if (duplicateContents) warnings.push(`发现 ${duplicateContents} 组完全重复的启用内容。`);
  const markerCounts = new Map<string, number>();
  enabledMarkers.forEach((module) => markerCounts.set(module.marker ?? "", (markerCounts.get(module.marker ?? "") ?? 0) + 1));
  const duplicateMarkers = [...markerCounts.entries()].filter(([, count]) => count > 1).map(([marker]) => marker);
  if (duplicateMarkers.length > 0) warnings.push(`存在重复结构插槽：${duplicateMarkers.join("、")}`);
  if (modules.some((module) => module.marker) && !enabledMarkers.some((module) => module.marker === "chatHistory")) {
    warnings.push("聊天历史结构插槽已关闭；模型不会收到当前会话记录。");
  }

  const combined = enabled.map((module) => module.content).join("\n");
  if (/第一人称/.test(combined) && /第三人称/.test(combined)) {
    warnings.push("同时检测到第一人称与第三人称要求，请确认叙事视角。");
  }
  if (/(简短|简洁|精炼)/.test(combined) && /(长篇|详尽|详细展开)/.test(combined)) {
    warnings.push("同时检测到简短与长篇输出要求，请确认回复长度。");
  }
  return warnings;
}
