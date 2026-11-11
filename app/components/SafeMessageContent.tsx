"use client";

import { createElement, Fragment, useEffect, useMemo, useState } from "react";
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
  "a", "b", "blockquote", "br", "code", "del", "details", "div", "em", "h1", "h2", "h3", "h4", "hr", "i", "li", "mark", "ol", "p", "pre", "rp", "rt", "ruby", "s", "small", "span", "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
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

function RichBlocks({ content }: { content: string }) {
  return /<\/?[a-z][\s\S]*?>/i.test(content) ? <SafeHtmlContent content={content} /> : <MarkdownBlocks content={content} />;
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

function MarkdownBlocks({ content }: { content: string }) {
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
      const language = line.trim().slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      nodes.push(<pre className="safe-code-block" key={`code-${index}`}><code data-language={language || undefined}>{code.join("\n")}</code></pre>);
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
    nodes.push(<p key={`paragraph-${index}`}>{withLineBreaks(paragraph.join("\n"))}</p>);
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
          <div className="theater-card-body"><RichBlocks content={section.content} /></div>
        </details>
      ) : section.type === "status" || section.type === "widget" ? (
        <NativeWidget section={section} key={`${section.type}-${index}-${section.title}`} />
      ) : (
        <div className="markdown-content" key={`text-${index}`}><RichBlocks content={section.content} /></div>
      ))}
      {showWarnings && result.warnings.length > 0 ? <div className="renderer-warnings" role="status">{result.warnings.map((warning) => <small key={warning}>{warning}</small>)}</div> : null}
    </div>
  );
}
