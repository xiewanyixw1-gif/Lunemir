"use client";

import { Fragment, useMemo } from "react";
import type { ReactNode } from "react";
import { normalizeOutputRenderer, transformOutputContent } from "../../lib/lunemir/output-renderer";
import type { OutputRendererConfig } from "../../lib/lunemir/types";

type Props = {
  source: string;
  config?: OutputRendererConfig;
  rawMode?: boolean;
  showWarnings?: boolean;
};

type TheaterSection = {
  type: "text" | "theater";
  title?: string;
  content: string;
};

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

function splitTheaterSections(content: string, enabled: boolean) {
  if (!enabled) return [{ type: "text" as const, content }];
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const sections: TheaterSection[] = [];
  let text: string[] = [];

  function flushText() {
    const value = text.join("\n").trim();
    if (value) sections.push({ type: "text", content: value });
    text = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const start = lines[index].match(/^\s*(:::theater|```theater)\s*(.*?)\s*$/i);
    if (!start) {
      text.push(lines[index]);
      continue;
    }
    flushText();
    const isFence = start[1].toLocaleLowerCase() === "```theater";
    const body: string[] = [];
    index += 1;
    while (index < lines.length && !(isFence ? /^\s*```\s*$/.test(lines[index]) : /^\s*:::\s*$/.test(lines[index]))) {
      body.push(lines[index]);
      index += 1;
    }
    sections.push({
      type: "theater",
      title: start[2].trim() || "小剧场",
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
    () => splitTheaterSections(result.content, resolvedConfig.theater),
    [result.content, resolvedConfig.theater],
  );

  if (rawMode || !resolvedConfig.enabled) return <pre className="message-raw-content">{source}</pre>;

  return (
    <div className="safe-message-content">
      {sections.map((section, index) => section.type === "theater" ? (
        <details className={`theater-card theater-card--${resolvedConfig.theaterTheme}`} open key={`theater-${index}-${section.title}`}>
          <summary><span>✦</span>{section.title}</summary>
          <div className="theater-card-body"><MarkdownBlocks content={section.content} /></div>
        </details>
      ) : (
        <div className="markdown-content" key={`text-${index}`}><MarkdownBlocks content={section.content} /></div>
      ))}
      {showWarnings && result.warnings.length > 0 ? <div className="renderer-warnings" role="status">{result.warnings.map((warning) => <small key={warning}>{warning}</small>)}</div> : null}
    </div>
  );
}
