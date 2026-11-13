import { createId } from "./defaults";
import type { PromptModule } from "./types";

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

  const combined = enabled.map((module) => module.content).join("\n");
  if (/第一人称/.test(combined) && /第三人称/.test(combined)) {
    warnings.push("同时检测到第一人称与第三人称要求，请确认叙事视角。");
  }
  if (/(简短|简洁|精炼)/.test(combined) && /(长篇|详尽|详细展开)/.test(combined)) {
    warnings.push("同时检测到简短与长篇输出要求，请确认回复长度。");
  }
  return warnings;
}
