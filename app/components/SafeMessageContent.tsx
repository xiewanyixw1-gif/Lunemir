"use client";

import { createElement, Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { normalizeOutputRenderer, transformOutputContent } from "../../lib/lunemir/output-renderer";
import type { OutputRendererConfig } from "../../lib/lunemir/types";

type Props = {
  source: string;
  config?: OutputRendererConfig;
  rawMode?: boolean;
  showWarnings?: boolean;
};

type TheaterSection = {
  type: "text" | "theater" | "status" | "widget";
  title?: string;
  content: string;
};

const SAFE_HTML_TAGS = new Set([
  "a", "article", "b", "blockquote", "br", "character-status", "code", "content", "dd", "del", "details", "div", "dl", "dt", "em", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "header", "hr", "i", "img", "li", "main", "mark", "meter", "ol", "p", "pre", "progress", "rp", "rt", "ruby", "s", "section", "small", "span", "status", "status-bar", "statusbar", "statusblock", "story-widget", "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u", "ul", "widget", "widget-block", "widgetblock",
]);
const BLOCKED_HTML_TAGS = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "form", "input", "button", "textarea", "select", "video", "audio", "source", "link", "meta"]);
const SAFE_STYLE_PROPERTIES = new Map<string, keyof CSSProperties>([
  ["color", "color"],
  ["background", "background"],
  ["background-color", "backgroundColor"],
  ["font-size", "fontSize"],
  ["font-weight", "fontWeight"],
  ["font-style", "fontStyle"],
  ["text-align", "textAlign"],
  ["text-decoration", "textDecoration"],
  ["letter-spacing", "letterSpacing"],
  ["line-height", "lineHeight"],
  ["white-space", "whiteSpace"],
  ["border", "border"],
  ["border-color", "borderColor"],
  ["border-style", "borderStyle"],
  ["border-width", "borderWidth"],
  ["border-radius", "borderRadius"],
  ["padding", "padding"],
]);

function safeStyleValue(value: string) {
  const trimmed = value.trim().slice(0, 120);
  if (!trimmed || /url\s*\(|expression\s*\(|javascript:|@import|\\/i.test(trimmed)) return "";
  const lengths = [...trimmed.matchAll(/(-?\d+(?:\.\d+)?)\s*(px|rem|em|%)/gi)];
  if (lengths.some((match) => {
    const amount = Number(match[1]);
    const unit = match[2].toLocaleLowerCase();
    return amount < 0 || (unit === "px" && amount > 64) || ((unit === "rem" || unit === "em") && amount > 4) || (unit === "%" && amount > 100);
  })) return "";
  return trimmed;
}

function readSafeStyle(element: Element) {
  const raw = element.getAttribute("style");
  if (!raw) return undefined;
  const style: Record<string, string> = {};
  raw.slice(0, 1_000).split(";").forEach((declaration) => {
    const separator = declaration.indexOf(":");
    if (separator < 1) return;
    const cssName = declaration.slice(0, separator).trim().toLocaleLowerCase();
    const reactName = SAFE_STYLE_PROPERTIES.get(cssName);
    const value = safeStyleValue(declaration.slice(separator + 1));
    if (reactName && value) style[reactName] = value;
  });
  return Object.keys(style).length > 0 ? style as CSSProperties : undefined;
}

function safeHref(value: string | null) {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.startsWith("#") || /^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed;
  return "";
}

function htmlNodeToReact(node: ChildNode, path: string): ReactNode {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeType !== 1) return null;
  const element = node as Element;
  const tag = element.tagName.toLocaleLowerCase();
  if (BLOCKED_HTML_TAGS.has(tag)) return null;
  if (element.children.length === 0 && /^\s*正在渲染(?:回忆|内容|组件)?[.…·]*\s*$/i.test(element.textContent ?? "")) return null;
  const children = [...element.childNodes].map((child, index) => htmlNodeToReact(child, `${path}-${index}`));
  if (!SAFE_HTML_TAGS.has(tag)) return <Fragment key={path}>{children}</Fragment>;
  const props: Record<string, unknown> = { key: path };
  const style = readSafeStyle(element);
  if (style) props.style = style;
  const title = element.getAttribute("title");
  if (title) props.title = title.slice(0, 200);
  if (tag === "a") {
    const href = safeHref(element.getAttribute("href"));
    if (href) {
      props.href = href;
      props.target = "_blank";
      props.rel = "noreferrer noopener";
    }
  }
  if (tag === "details" && element.hasAttribute("open")) props.open = true;
  if (tag === "td" || tag === "th") {
    const colSpan = Number(element.getAttribute("colspan"));
    const rowSpan = Number(element.getAttribute("rowspan"));
    if (Number.isInteger(colSpan) && colSpan > 1 && colSpan <= 12) props.colSpan = colSpan;
    if (Number.isInteger(rowSpan) && rowSpan > 1 && rowSpan <= 12) props.rowSpan = rowSpan;
  }
  return createElement(tag, props, ...children);
}

function SafeHtmlContent({ content }: { content: string }) {
  const [parsed, setParsed] = useState<{ source: string; nodes: ReactNode[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const document = new DOMParser().parseFromString(content, "text/html");
      setParsed({ source: content, nodes: [...document.body.childNodes].map((node, index) => htmlNodeToReact(node, `html-${index}`)) });
    });
    return () => { cancelled = true; };
  }, [content]);
  const nodes = parsed?.source === content ? parsed.nodes : null;
  return <div className="safe-html-content">{nodes ?? content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}</div>;
}

const PRESET_STYLE_LIMIT = 60_000;
const PRESET_ATTRIBUTE_LIMIT = 500;

export function sanitizePresetCss(value: string) {
  return value
    .slice(0, PRESET_STYLE_LIMIT)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@(?:import|charset|namespace)\b[^;]*;?/gi, "")
    .replace(/@font-face\s*\{[\s\S]*?\}/gi, "")
    .replace(/(?:-webkit-)?image-set\s*\([^)]*\)/gi, "none")
    .replace(/url\s*\(\s*(["']?)([^)'"]+)\1\s*\)/gi, (_match, _quote: string, asset: string) => {
      const normalized = asset.trim();
      return /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z\d+/=\s]+$/i.test(normalized) ? `url("${normalized}")` : "none";
    })
    .replace(/(?:expression|javascript|vbscript)\s*[:(][^;}\n]*/gi, "")
    .replace(/(?:behavior|-moz-binding)\s*:[^;}\n]*/gi, "")
    .replace(/:host(?:\([^)]*\))?/gi, ".lm-preset-root")
    .replace(/::slotted(?:\([^)]*\))?/gi, "")
    .replace(/(^|[},]\s*)(?:html|body|:root)(?=\s*(?:[,>{.#:[+~]|$))/gim, "$1.lm-preset-root")
    .replace(/\bposition\s*:\s*(?:fixed|sticky)\b/gi, "position: relative");
}

function sanitizeClassNames(value: string) {
  return value.split(/\s+/).filter((item) => /^[a-z_][\w-]{0,63}$/i.test(item)).slice(0, 24).join(" ");
}

function appendSanitizedPresetNode(parent: Node, node: Node, ownerDocument: Document) {
  if (node.nodeType === Node.TEXT_NODE) {
    parent.appendChild(ownerDocument.createTextNode((node.textContent ?? "").slice(0, 100_000)));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const source = node as Element;
  const tag = source.tagName.toLocaleLowerCase();
  if (tag === "style" || BLOCKED_HTML_TAGS.has(tag)) return;
  const safeCustomElement = /^[a-z][a-z\d]*-[a-z\d-]+$/.test(tag);
  if (!SAFE_HTML_TAGS.has(tag) && !safeCustomElement) {
    [...source.childNodes].forEach((child) => appendSanitizedPresetNode(parent, child, ownerDocument));
    return;
  }

  const target = ownerDocument.createElement(tag);
  const className = sanitizeClassNames(source.getAttribute("class") ?? "");
  if (className) target.setAttribute("class", className);
  const id = source.getAttribute("id") ?? "";
  if (/^[a-z_][\w-]{0,63}$/i.test(id)) target.id = id;
  const inlineStyle = source.getAttribute("style");
  if (inlineStyle) target.setAttribute("style", sanitizePresetCss(inlineStyle).replace(/[{}]/g, "").slice(0, 2_000));

  [...source.attributes].forEach((attribute) => {
    const name = attribute.name.toLocaleLowerCase();
    const value = attribute.value.slice(0, PRESET_ATTRIBUTE_LIMIT);
    if (/^aria-[\w-]+$/.test(name) || /^data-[\w-]+$/.test(name)) target.setAttribute(name, value);
    if (name === "title" || (name === "role" && /^[a-z][\w-]*$/i.test(value))) target.setAttribute(name, value);
  });
  if (tag === "a") {
    const href = source.getAttribute("href") ?? "";
    if (/^#[\w-]+$/.test(href)) target.setAttribute("href", href);
  }
  if (tag === "img") {
    const sourceUrl = source.getAttribute("src") ?? "";
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z\d+/=\s]+$/i.test(sourceUrl)) target.setAttribute("src", sourceUrl);
    const alt = source.getAttribute("alt");
    if (alt) target.setAttribute("alt", alt.slice(0, 200));
    target.setAttribute("loading", "lazy");
  }
  if (tag === "details" && source.hasAttribute("open")) target.setAttribute("open", "");
  if (tag === "td" || tag === "th") {
    ["colspan", "rowspan"].forEach((name) => {
      const amount = Number(source.getAttribute(name));
      if (Number.isInteger(amount) && amount > 1 && amount <= 12) target.setAttribute(name, String(amount));
    });
  }
  if (tag === "progress" || tag === "meter") {
    ["min", "max", "value", "low", "high", "optimum"].forEach((name) => {
      const amount = Number(source.getAttribute(name));
      if (Number.isFinite(amount)) target.setAttribute(name, String(amount));
    });
  }
  if (tag === "time") {
    const dateTime = source.getAttribute("datetime");
    if (dateTime) target.setAttribute("datetime", dateTime.slice(0, 80));
  }
  [...source.childNodes].forEach((child) => appendSanitizedPresetNode(target, child, ownerDocument));
  parent.appendChild(target);
}

function IsolatedPresetHtml({ content }: { content: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadow.replaceChildren();
    const parsed = new DOMParser().parseFromString(content, "text/html");
    const style = document.createElement("style");
    const importedCss = [...parsed.querySelectorAll("style")].map((item) => item.textContent ?? "").join("\n");
    style.textContent = `
      :host{display:block;width:100%;min-width:0;color:inherit;font:inherit}
      .lm-preset-root{position:relative;display:block;max-width:100%;overflow:hidden;contain:layout paint style;isolation:isolate;color:inherit;font:inherit;line-height:inherit}
      .lm-preset-root,.lm-preset-root *,.lm-preset-root *::before,.lm-preset-root *::after{box-sizing:border-box;max-width:100%}
      .lm-preset-root content{display:block;white-space:pre-wrap;overflow-wrap:anywhere}
      .lm-preset-root p{overflow-wrap:anywhere}
      .lm-preset-root table{width:100%;border-collapse:collapse}
      .lm-preset-root pre{overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
      .lm-preset-root a{color:inherit}
      ${sanitizePresetCss(importedCss)}
    `;
    const root = document.createElement("div");
    root.className = "lm-preset-root";
    [...parsed.body.childNodes].forEach((node) => appendSanitizedPresetNode(root, node, document));
    shadow.append(style, root);
  }, [content]);
  return <div className="preset-html-sandbox" ref={hostRef} data-render-mode="isolated-preset" />;
}

function RichBlocks({ content, isolatedHtml = true }: { content: string; isolatedHtml?: boolean }) {
  const trimmed = content.trim();
  const hasHtml = /<\/?[a-z][\s\S]*?>/i.test(trimmed);
  const rawHtmlDocument = hasHtml
    && !trimmed.includes("```")
    && (/^(?:<!doctype\s+html[^>]*>\s*)?<(?:style|article|aside|blockquote|content|details|div|h[1-4]|main|ol|p|pre|section|status|statusbar|table|ul|widget)\b/i.test(trimmed)
      || /<style\b/i.test(trimmed));
  if (!rawHtmlDocument) return <MarkdownBlocks content={content} isolatedHtml={isolatedHtml} />;
  return isolatedHtml ? <IsolatedPresetHtml content={content} /> : <SafeHtmlContent content={content} />;
}

type WidgetRow = { label: string; value: string };

function inlineMarkdown(value: string) {
  const tokenPattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(value)) !== null) {
    if (match.index > cursor) nodes.push(value.slice(cursor, match.index));
    const token = match[0];
    const key = `${match.index}-${token.length}`;
    if (token.startsWith("`")) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**") || token.startsWith("__")) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    cursor = match.index + token.length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function withLineBreaks(value: string) {
  return value.split("\n").map((line, index, lines) => (
    <Fragment key={`${index}-${line.length}`}>{inlineMarkdown(line)}{index < lines.length - 1 ? <br /> : null}</Fragment>
  ));
}

function MarkdownBlocks({ content, isolatedHtml = true }: { content: string; isolatedHtml?: boolean }) {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const fenceInfo = line.trim().slice(3).trim();
      const [language = "", ...titleParts] = fenceInfo.split(/\s+/);
      const title = titleParts.join(" ").trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const codeContent = code.join("\n");
      if (/^html?$/i.test(language)) {
        const useIsolatedRenderer = isolatedHtml && /<style\b|\bclass\s*=|\bid\s*=/i.test(codeContent);
        nodes.push(
          <section className="safe-html-fence" key={`html-${index}`}>
            {title ? <header><span>HTML</span><strong>{title}</strong></header> : null}
            {/<\/?[a-z][\s\S]*?>/i.test(codeContent)
              ? useIsolatedRenderer ? <IsolatedPresetHtml content={codeContent} /> : <SafeHtmlContent content={codeContent} />
              : <MarkdownBlocks content={codeContent} isolatedHtml={isolatedHtml} />}
          </section>,
        );
      } else {
        nodes.push(<pre className="safe-code-block" key={`code-${index}`}><code data-language={language || undefined}>{codeContent}</code></pre>);
      }
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const children = inlineMarkdown(heading[2]);
      nodes.push(level === 1
        ? <h2 key={`heading-${index}`}>{children}</h2>
        : level === 2
          ? <h3 key={`heading-${index}`}>{children}</h3>
          : <h4 key={`heading-${index}`}>{children}</h4>);
      index += 1;
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      nodes.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      nodes.push(<blockquote key={`quote-${index}`}>{withLineBreaks(quote.join("\n"))}</blockquote>);
      continue;
    }

    if (/^\s*[-+*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-+*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-+*]\s+/, ""));
        index += 1;
      }
      nodes.push(<ul key={`list-${index}`}>{items.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{inlineMarkdown(item)}</li>)}</ul>);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ""));
        index += 1;
      }
      nodes.push(<ol key={`ordered-${index}`}>{items.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{inlineMarkdown(item)}</li>)}</ol>);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index].trim()
      && !/^(#{1,3})\s+/.test(lines[index])
      && !/^\s*(?:[-+*]\s+|\d+[.)]\s+|>|```|---+$)/.test(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    const paragraphContent = paragraph.join("\n");
    nodes.push(/<\/?[a-z][\s\S]*?>/i.test(paragraphContent)
      ? <SafeHtmlContent content={paragraphContent} key={`html-paragraph-${index}`} />
      : <p key={`paragraph-${index}`}>{withLineBreaks(paragraphContent)}</p>);
  }

  return <>{nodes}</>;
}

function parseWidgetRows(content: string): WidgetRow[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const value = JSON.parse(trimmed) as Record<string, unknown>;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return Object.entries(value).slice(0, 16).map(([label, item]) => ({
          label,
          value: typeof item === "string" ? item : JSON.stringify(item),
        }));
      }
    } catch {
      // Fall through to the readable key/value format.
    }
  }
  const knownLabels: Record<string, string> = {
    name: "角色",
    location: "地点",
    time: "时间",
    observation: "观察",
    voice: "心声",
    image: "画面",
    post: "动态",
    story: "剧情",
  };
  const labelPattern = Object.keys(knownLabels).join("|");
  const inlineRows = [...trimmed.matchAll(new RegExp(`(?:^|\\s)(${labelPattern})\\s*[:：]\\s*([\\s\\S]*?)(?=\\s+(?:${labelPattern})\\s*[:：]|$)`, "gi"))]
    .map((match) => ({ label: knownLabels[match[1].toLocaleLowerCase()] ?? match[1], value: match[2].trim() }))
    .filter((row) => row.value);
  if (inlineRows.length > 0) return inlineRows.slice(0, 16);
  return trimmed.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*[-*]?\s*([^:：|]{1,32})\s*[:：|]\s*(.+?)\s*$/);
    return match ? [{ label: match[1].trim(), value: match[2].trim() }] : [];
  }).slice(0, 16);
}

function NativeWidget({ section }: { section: TheaterSection }) {
  const rows = parseWidgetRows(section.content);
  const title = section.title || (section.type === "status" ? "当前状态" : "剧情组件");
  return (
    <section className={`native-widget native-widget--${section.type}`} data-widget-title={title}>
      <header><span>{section.type === "status" ? "STATUS" : "WIDGET"}</span><strong>{title}</strong></header>
      {rows.length > 0 ? (
        <dl>{rows.map((row, index) => <div key={`${row.label}-${index}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
      ) : (
        <div className="native-widget-body"><MarkdownBlocks content={section.content} /></div>
      )}
    </section>
  );
}

function splitRichSections(content: string, theaterEnabled: boolean, widgetsEnabled: boolean) {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const sections: TheaterSection[] = [];
  let text: string[] = [];

  function flushText() {
    const value = text.join("\n").trim();
    if (value) sections.push({ type: "text", content: value });
    text = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const start = lines[index].match(/^\s*(:::|```)(theater|status|widget)\s*(.*?)\s*$/i);
    if (!start) {
      text.push(lines[index]);
      continue;
    }
    const sectionType = start[2].toLocaleLowerCase() as "theater" | "status" | "widget";
    if ((sectionType === "theater" && !theaterEnabled) || (sectionType !== "theater" && !widgetsEnabled)) {
      text.push(lines[index]);
      continue;
    }
    flushText();
    const isFence = start[1] === "```";
    const body: string[] = [];
    index += 1;
    while (index < lines.length && !(isFence ? /^\s*```\s*$/.test(lines[index]) : /^\s*:::\s*$/.test(lines[index]))) {
      body.push(lines[index]);
      index += 1;
    }
    sections.push({
      type: sectionType,
      title: start[3].trim() || (sectionType === "theater" ? "小剧场" : sectionType === "status" ? "当前状态" : "剧情组件"),
      content: body.join("\n").trim(),
    });
  }
  flushText();
  return sections;
}

export function SafeMessageContent({ source, config, rawMode = false, showWarnings = false }: Props) {
  const resolvedConfig = useMemo(() => normalizeOutputRenderer(config), [config]);
  const result = useMemo(
    () => transformOutputContent(source, resolvedConfig),
    [resolvedConfig, source],
  );
  const sections = useMemo(
    () => splitRichSections(result.content, resolvedConfig.theater, resolvedConfig.widgets),
    [result.content, resolvedConfig.theater, resolvedConfig.widgets],
  );

  if (rawMode || !resolvedConfig.enabled) return <pre className="message-raw-content">{source}</pre>;

  return (
    <div className="safe-message-content">
      {sections.map((section, index) => section.type === "theater" ? (
        <details className={`theater-card theater-card--${resolvedConfig.theaterTheme}`} open key={`theater-${index}-${section.title}`}>
          <summary><span>✦</span>{section.title}</summary>
          <div className="theater-card-body"><RichBlocks content={section.content} isolatedHtml={resolvedConfig.isolatedHtml} /></div>
        </details>
      ) : section.type === "status" || section.type === "widget" ? (
        <NativeWidget section={section} key={`${section.type}-${index}-${section.title}`} />
      ) : (
        <div className="markdown-content" key={`text-${index}`}><RichBlocks content={section.content} isolatedHtml={resolvedConfig.isolatedHtml} /></div>
      ))}
      {showWarnings && result.warnings.length > 0 ? <div className="renderer-warnings" role="status">{result.warnings.map((warning) => <small key={warning}>{warning}</small>)}</div> : null}
    </div>
  );
}
