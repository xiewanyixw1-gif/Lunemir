import { createId } from "./defaults";
import type { OutputRegexRule, OutputRendererConfig, PromptFilterRule, Role } from "./types";

const ALLOWED_REGEX_FLAGS = new Set(["g", "i", "m", "s", "u"]);
const MAX_RULES = 40;
const MAX_PATTERN_LENGTH = 2_000;
const MAX_OUTPUT_LENGTH = 200_000;

export const DEFAULT_OUTPUT_RENDERER: OutputRendererConfig = {
  enabled: true,
  markdown: true,
  isolatedHtml: true,
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
    isolatedHtml: config?.isolatedHtml ?? DEFAULT_OUTPUT_RENDERER.isolatedHtml,
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
  if (asString(raw.findRegex ?? raw.find_regex ?? raw.pattern)) return [raw];
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
  const direct = candidates.flatMap((candidate) => Array.isArray(candidate) ? candidate : []);
  if (direct.length > 0) return direct;

  const queue: Array<{ value: UnknownRecord; depth: number }> = [{ value: raw, depth: 0 }];
  const visited = new Set<UnknownRecord>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.value) || current.depth > 4) continue;
    visited.add(current.value);
    for (const value of Object.values(current.value)) {
      if (Array.isArray(value)) {
        const scripts = value.filter((item) => {
          const record = asRecord(item);
          return Boolean(asString(record.findRegex ?? record.find_regex ?? record.pattern));
        });
        if (scripts.length > 0) return scripts;
        value.forEach((item) => {
          const record = asRecord(item);
          if (Object.keys(record).length > 0) queue.push({ value: record, depth: current.depth + 1 });
        });
      } else {
        const record = asRecord(value);
        if (Object.keys(record).length > 0) queue.push({ value: record, depth: current.depth + 1 });
      }
    }
  }
  return undefined;
}

function optionalDepth(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined;
}

export function normalizeImportedPromptFilters(raw: UnknownRecord): PromptFilterRule[] {
  const nativeFilters = Array.isArray(raw.lunemir_prompt_filters)
    ? raw.lunemir_prompt_filters.map((value) => ({ ...asRecord(value), promptOnly: true }))
    : [];
  const importedScripts = [...nativeFilters, ...(findImportedRegexScripts(raw) ?? [])];
  const normalized = importedScripts.slice(0, MAX_RULES).flatMap((value, index) => {
    const script = asRecord(value);
    if (script.promptOnly !== true) return [];
    const literal = parseRegexLiteral(asString(script.findRegex ?? script.find_regex ?? script.pattern));
    if (!literal.pattern) return [];
    const placement = Array.isArray(script.placement) ? script.placement : [];
    const assistantOnly = script.scope === "all"
      ? false
      : script.scope === "assistant" || placement.length === 0 || placement.some((item) => item === 2 || item === "ai_output" || item === "assistant");
    return [{
      id: asString(script.id) || createId("prompt-filter"),
      name: asString(script.scriptName ?? script.name) || `历史过滤 ${index + 1}`,
      pattern: literal.pattern,
      replacement: asString(script.replaceString ?? script.replace_string ?? script.replacement),
      flags: cleanFlags(literal.flags || asString(script.flags)),
      enabled: script.enabled !== false && script.disabled !== true,
      scope: assistantOnly ? "assistant" as const : "all" as const,
      minDepth: optionalDepth(script.minDepth ?? script.min_depth),
      maxDepth: optionalDepth(script.maxDepth ?? script.max_depth),
    }];
  });
  return normalized.filter((rule, index) => normalized.findIndex((candidate) => (
    candidate.id === rule.id || (candidate.pattern === rule.pattern && candidate.replacement === rule.replacement)
  )) === index);
}

export function applyPromptFilters(content: string, rules: PromptFilterRule[] = [], role: Role = "assistant", depth = 0) {
  let output = content.slice(0, MAX_OUTPUT_LENGTH);
  rules.slice(0, MAX_RULES).forEach((rule) => {
    if (!rule.enabled || !rule.pattern || (rule.scope === "assistant" && role !== "assistant")) return;
    if (rule.minDepth !== undefined && depth < rule.minDepth) return;
    if (rule.maxDepth !== undefined && depth > rule.maxDepth) return;
    if (likelyUnsafeRegex(rule.pattern)) return;
    try {
      output = output.replace(new RegExp(rule.pattern, cleanFlags(rule.flags)), rule.replacement).slice(0, MAX_OUTPUT_LENGTH);
    } catch {
      // Invalid imported filters are ignored without changing stored history.
    }
  });
  return output;
}

export function normalizeImportedOutputRenderer(raw: UnknownRecord) {
  const native = asRecord(raw.lunemir_output_renderer);
  const nativeRules = Array.isArray(native.regexRules) ? native.regexRules.map(asRecord) : [];
  if (Object.keys(native).length > 0) {
    return normalizeOutputRenderer({
      enabled: native.enabled !== false,
      markdown: native.markdown !== false,
      isolatedHtml: native.isolatedHtml !== false,
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

export function normalizeEmbeddedOutputRenderer(extensions?: Record<string, unknown> | null) {
  if (!extensions) return null;
  const renderer = normalizeImportedOutputRenderer({ extensions });
  return renderer.regexRules.length > 0 ? renderer : null;
}

export function resolveOutputRendererConfig(
  presetConfig?: Partial<OutputRendererConfig> | null,
  characterExtensions?: Record<string, unknown> | null,
  characterRendererEnabled = true,
) {
  const presetRenderer = presetConfig ? normalizeOutputRenderer(presetConfig) : null;
  const characterRenderer = characterRendererEnabled
    ? normalizeEmbeddedOutputRenderer(characterExtensions)
    : null;
  if (!presetRenderer && !characterRenderer) return null;
  const base = presetRenderer ?? characterRenderer ?? DEFAULT_OUTPUT_RENDERER;
  const rules = [
    ...(characterRenderer?.regexRules ?? []).map((rule) => ({ ...rule, id: `character-${rule.id}` })),
    ...(presetRenderer?.regexRules ?? []).map((rule) => ({ ...rule, id: `preset-${rule.id}` })),
  ];
  return normalizeOutputRenderer({
    ...base,
    enabled: Boolean(characterRenderer || presetRenderer?.enabled),
    isolatedHtml: Boolean(characterRenderer) || base.isolatedHtml,
    regexRules: rules,
  });
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

type TextRange = { start: number; end: number; css: string };

function balancedCssRange(value: string, start: number, openingBrace: number) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = openingBrace; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return { start, end: index + 1, css: value.slice(start, index + 1) };
    }
  }
  return null;
}

export function normalizeLeakedStyleSource(value: string) {
  if (!value.includes("{") || !value.includes("}")) return value;
  if (/<style\b[^>]*>[\s\S]*?<\/style\s*>/i.test(value)) return value;

  const ranges: TextRange[] = [];
  const fencedCss = /```(?:css|scss|less)\s*\r?\n([\s\S]*?)```/gi;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fencedCss.exec(value)) !== null) {
    ranges.push({ start: fenceMatch.index, end: fencedCss.lastIndex, css: fenceMatch[1] });
  }

  const selector = /(?:^|\n)[ \t]*(?:@(?:media|supports|container|keyframes|-webkit-keyframes)\b[^\n{]*|[.#:\[][^{\n]{0,240}|[a-z][\w-]*(?:[.#:\[>+~][^{\n]{0,220}|\s+[.#:\[a-z][^{\n]{0,200}))\{/gim;
  let selectorMatch: RegExpExecArray | null;
  while ((selectorMatch = selector.exec(value)) !== null) {
    const openingBrace = selector.lastIndex - 1;
    const lineOffset = selectorMatch[0].startsWith("\n") ? 1 : 0;
    const range = balancedCssRange(value, selectorMatch.index + lineOffset, openingBrace);
    if (!range) continue;
    const declarations = range.css.match(/(?:^|[;{])\s*--?[a-z][\w-]*\s*:|(?:^|[;{])\s*[a-z][\w-]*\s*:/gim) ?? [];
    if (declarations.length < 2) continue;
    ranges.push(range);
    selector.lastIndex = range.end;
  }

  if (ranges.length === 0) return value;
  const ordered: TextRange[] = [];
  ranges
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .forEach((range) => {
      const previous = ordered.at(-1);
      if (!previous || range.start >= previous.end) ordered.push(range);
    });
  const css = ordered.map((range) => range.css).join("\n");
  const declarationCount = css.match(/(?:^|[;{])\s*(?:--)?[a-z][\w-]*\s*:/gim)?.length ?? 0;
  if (css.length < 240 || declarationCount < 4) return value;

  let cursor = 0;
  let insertionIndex = 0;
  let output = "";
  ordered.forEach((range, index) => {
    output += value.slice(cursor, range.start);
    if (index === 0) insertionIndex = output.length;
    cursor = range.end;
  });
  output += value.slice(cursor);
  output = output
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*=+(?:\s*\/)?\s*$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n");
  const hasRenderableMarkup = /<\/?(?:article|aside|blockquote|content|details|div|footer|header|main|section|status|table|widget|[a-z][\w]*-[\w-]+)\b/i.test(output);
  if (!hasRenderableMarkup) return output.trim();
  const style = `<style>${css}</style>\n`;
  return `${output.slice(0, insertionIndex)}${style}${output.slice(insertionIndex)}`.trim();
}

function stripNativeFallbackSections(value: string) {
  return value.replace(
    /(?:^|\n)[ \t]*:::(?:status|widget)(?:[^\n]*)\r?\n[\s\S]*?\r?\n[ \t]*:::[ \t]*(?=\r?\n|$)/gi,
    "\n",
  );
}

function normalizeSafeHtml(value: string, preservePresetComponents = false) {
  let output = normalizeBracketWidgets(value)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|iframe|object|embed|svg|math|link|meta)\b[^>]*\/?\s*>/gi, "")
    .replace(/<lunemir-theater\b[^>]*?(?:title=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/lunemir-theater\s*>/gi, "<details open><summary>$1</summary>$2</details>")
    .replace(/<lunemir-status\b[^>]*?(?:title=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/lunemir-status\s*>/gi, "\n:::status $1\n$2\n:::\n")
    .replace(/<lunemir-widget\b[^>]*?(?:type=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/lunemir-widget\s*>/gi, "\n:::widget $1\n$2\n:::\n");
  if (!preservePresetComponents) {
    output = output
      .replace(/<(status(?:-?block|-?bar)?|character-status)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, "\n:::status 当前状态\n$2\n:::\n")
      .replace(/<(widget(?:-?block)?|story-widget)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, "\n:::widget 剧情组件\n$2\n:::\n");
  } else if (/<style\b|\bclass\s*=|\bid\s*=|<\/?(?:content|statusbar|[a-z][\w]*-[\w-]+)\b/i.test(output)) {
    // A character card or preset owns the presentation. Remove only Lunemir's
    // generated fallback blocks so old replies cannot display two status bars.
    output = stripNativeFallbackSections(output);
  }
  return normalizeLeakedStyleSource(decodeSafeEntities(output)).replace(/\n{4,}/g, "\n\n\n").trim();
}

export function presetUsesCustomPresentation(config: OutputRendererConfig, promptText = "") {
  if (!config.enabled || !config.isolatedHtml) return false;
  const rendererText = config.regexRules
    .filter((rule) => rule.enabled)
    .map((rule) => rule.replacement)
    .join("\n");
  const presentationSource = `${promptText}\n${rendererText}`;
  const hasHtmlTemplate = /<(?:!doctype|style|content|div|section|article|header|footer|table|details|progress|meter|status(?:block|-bar)?|character-status|widget(?:block|-block)?)\b|\bclass\s*=|\bid\s*=|\[(?:ui_panel|status_panel|statusbar)\]/i
    .test(presentationSource);
  const hasCssTemplate = /(?:^|\n)\s*(?:[.#][a-z_][\w-]*(?:\s+[.#]?[a-z_][\w-]*)*|@(?:media|supports|container)\b[^\n{]*)\s*\{/im
    .test(presentationSource);
  return hasHtmlTemplate || hasCssTemplate;
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

  if (config.markdown) {
    const preservePresetComponents = config.isolatedHtml && (
      presetUsesCustomPresentation(config)
      || /<style\b|\bclass\s*=|\bid\s*=/i.test(content)
    );
    content = normalizeSafeHtml(content, preservePresetComponents);
  }
  return { content, changed: content !== source, warnings };
}
