import { createId } from "./defaults";
import type { OutputRegexRule, OutputRendererConfig, Role } from "./types";

const ALLOWED_REGEX_FLAGS = new Set(["g", "i", "m", "s", "u"]);
const MAX_RULES = 40;
const MAX_PATTERN_LENGTH = 2_000;
const MAX_OUTPUT_LENGTH = 200_000;

export const DEFAULT_OUTPUT_RENDERER: OutputRendererConfig = {
  enabled: true,
  markdown: true,
  theater: true,
  widgets: true,
  theaterTheme: "glass",
  regexRules: [],
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseRegexLiteral(source: string) {
  const match = source.match(/^\/([\s\S]*)\/([a-z]*)$/);
  if (!match) return { pattern: source, flags: "g" };
  return { pattern: match[1], flags: match[2] || "g" };
}

function cleanFlags(value: string) {
  return [...new Set(value.split("").filter((flag) => ALLOWED_REGEX_FLAGS.has(flag)))].join("");
}

export function createOutputRegexRule(index: number): OutputRegexRule {
  return {
    id: createId("regex"),
    name: `美化规则 ${index + 1}`,
    pattern: "",
    replacement: "",
    flags: "g",
    enabled: true,
    scope: "assistant",
  };
}

export function normalizeOutputRenderer(config?: Partial<OutputRendererConfig> | null): OutputRendererConfig {
  return {
    enabled: config?.enabled ?? DEFAULT_OUTPUT_RENDERER.enabled,
    markdown: config?.markdown ?? DEFAULT_OUTPUT_RENDERER.markdown,
    theater: config?.theater ?? DEFAULT_OUTPUT_RENDERER.theater,
    widgets: config?.widgets ?? DEFAULT_OUTPUT_RENDERER.widgets,
    theaterTheme: ["glass", "minimal", "paper"].includes(config?.theaterTheme ?? "")
      ? config?.theaterTheme as OutputRendererConfig["theaterTheme"]
      : DEFAULT_OUTPUT_RENDERER.theaterTheme,
    regexRules: Array.isArray(config?.regexRules)
      ? config.regexRules.slice(0, MAX_RULES).map((rule, index) => ({
          id: rule.id || createId("regex"),
          name: rule.name?.trim() || `美化规则 ${index + 1}`,
          pattern: rule.pattern ?? "",
          replacement: rule.replacement ?? "",
          flags: cleanFlags(rule.flags ?? "g"),
          enabled: rule.enabled !== false,
          scope: rule.scope === "all" ? "all" : "assistant",
        }))
      : [],
  };
}

function findImportedRegexScripts(raw: UnknownRecord) {
  const extensions = asRecord(raw.extensions);
  const extensionSettings = asRecord(raw.extension_settings);
  const candidates = [
    raw.regex_scripts,
    raw.regexScripts,
    raw.regex,
    extensions.regex_scripts,
    extensions.regexScripts,
    extensionSettings.regex,
    extensionSettings.regex_scripts,
  ];
  return candidates.find(Array.isArray) as unknown[] | undefined;
}

export function normalizeImportedOutputRenderer(raw: UnknownRecord) {
  const native = asRecord(raw.lunemir_output_renderer);
  const nativeRules = Array.isArray(native.regexRules) ? native.regexRules.map(asRecord) : [];
  if (Object.keys(native).length > 0) {
    return normalizeOutputRenderer({
      enabled: native.enabled !== false,
      markdown: native.markdown !== false,
      theater: native.theater !== false,
      widgets: native.widgets !== false,
      theaterTheme: asString(native.theaterTheme) as OutputRendererConfig["theaterTheme"],
      regexRules: nativeRules.map((rule, index) => ({
        id: asString(rule.id) || createId("regex"),
        name: asString(rule.name) || `美化规则 ${index + 1}`,
        pattern: asString(rule.pattern),
        replacement: asString(rule.replacement),
        flags: asString(rule.flags) || "g",
        enabled: rule.enabled !== false,
        scope: rule.scope === "all" ? "all" : "assistant",
      })),
    });
  }

  const importedScripts = findImportedRegexScripts(raw) ?? [];
  const regexRules = importedScripts.slice(0, MAX_RULES).flatMap((value, index) => {
    const script = asRecord(value);
    const literal = parseRegexLiteral(asString(script.findRegex ?? script.find_regex ?? script.pattern));
    if (!literal.pattern) return [];
    const placement = Array.isArray(script.placement) ? script.placement : [];
    const supportsAssistantOutput = placement.length === 0 || placement.some((item) => item === 2 || item === "ai_output" || item === "assistant");
    return [{
      id: asString(script.id) || createId("regex"),
      name: asString(script.scriptName ?? script.name) || `导入规则 ${index + 1}`,
      pattern: literal.pattern,
      replacement: asString(script.replaceString ?? script.replace_string ?? script.replacement),
      flags: cleanFlags(literal.flags),
      enabled: script.disabled !== true && script.promptOnly !== true && supportsAssistantOutput,
      scope: "assistant" as const,
    }];
  });

  return normalizeOutputRenderer({ regexRules });
}

function likelyUnsafeRegex(pattern: string) {
  if (pattern.length > MAX_PATTERN_LENGTH) return true;
  return /(\([^)]*[+*][^)]*\))[+*{]/.test(pattern) || /(\.\*){2,}/.test(pattern);
}

function decodeSafeEntities(value: string) {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };
  return value.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const codePoint = entity.startsWith("#x")
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }
    return entities[entity.toLocaleLowerCase()] ?? match;
  });
}

function normalizeBracketWidgets(value: string) {
  return value.replace(/\[(UI_PANEL|STATUS_PANEL|MEMORY_PANEL)\]([\s\S]*?)\[\/\1\]/gi, (_match, rawType: string, body: string) => {
    const memoryPanel = rawType.toLocaleUpperCase() === "MEMORY_PANEL";
    return `\n:::${memoryPanel ? "widget 回忆书签" : "status 剧情状态"}\n${body.trim()}\n:::\n`;
  });
}

function normalizeSafeHtml(value: string) {
  const output = normalizeBracketWidgets(value)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|svg|math)\b[^>]*\/?\s*>/gi, "")
    .replace(/<lunemir-theater\b[^>]*?(?:title=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/lunemir-theater\s*>/gi, "<details open><summary>$1</summary>$2</details>")
    .replace(/<lunemir-status\b[^>]*?(?:title=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/lunemir-status\s*>/gi, "\n:::status $1\n$2\n:::\n")
    .replace(/<lunemir-widget\b[^>]*?(?:type=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/lunemir-widget\s*>/gi, "\n:::widget $1\n$2\n:::\n")
    .replace(/<(status(?:-?block|-?bar)?|character-status)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, "\n:::status 当前状态\n$2\n:::\n")
    .replace(/<(widget(?:-?block)?|story-widget)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, "\n:::widget 剧情组件\n$2\n:::\n");
  return decodeSafeEntities(output).replace(/\n{4,}/g, "\n\n\n").trim();
}

export type OutputTransformResult = {
  content: string;
  changed: boolean;
  warnings: string[];
};

export function transformOutputContent(
  source: string,
  config: OutputRendererConfig,
  role: Role = "assistant",
): OutputTransformResult {
  if (!config.enabled || role !== "assistant") return { content: source, changed: false, warnings: [] };
  let content = source.slice(0, MAX_OUTPUT_LENGTH);
  const warnings: string[] = [];

  for (const rule of config.regexRules.slice(0, MAX_RULES)) {
    if (!rule.enabled || !rule.pattern || (rule.scope === "assistant" && role !== "assistant")) continue;
    if (likelyUnsafeRegex(rule.pattern)) {
      warnings.push(`${rule.name}：表达式过长或可能造成卡顿，已跳过。`);
      continue;
    }
    try {
      const regex = new RegExp(rule.pattern, cleanFlags(rule.flags));
      content = content.replace(regex, rule.replacement).slice(0, MAX_OUTPUT_LENGTH);
    } catch {
      warnings.push(`${rule.name}：表达式无效，已跳过。`);
    }
  }

  if (config.markdown) content = normalizeSafeHtml(content);
  return { content, changed: content !== source, warnings };
}
