"use client";

import { useMemo, useState } from "react";
import type { ContextReport } from "../../lib/lunemir/types";

type InspectorProps = {
  report: ContextReport;
  presetName?: string;
  onClose: () => void;
};

export function ContextInspectorModal({ report, presetName, onClose }: InspectorProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const compiledText = useMemo(() => report.promptMessages
    .map((message) => `[${message.label} · ${message.role}]\n${message.content}`)
    .join("\n\n━━━━━━━━━━━━━━━━\n\n"), [report.promptMessages]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(compiledText);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="modal-backdrop context-inspector-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="glass-panel context-inspector" role="dialog" aria-modal="true" aria-labelledby="context-inspector-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="关闭提示词检查器">×</button>
        <header className="context-inspector-heading">
          <div><span className="eyebrow">PROMPT INSPECTOR</span><h2 id="context-inspector-title">本轮模型实际上下文</h2><p>按发送顺序展示。这里的内容就是下一次生成时交给模型的角色、世界书、记忆与对话。</p></div>
          <button type="button" onClick={() => void copyPrompt()}>{copyState === "copied" ? "已复制" : copyState === "error" ? "复制失败" : "复制完整上下文"}</button>
        </header>

        <div className="context-inspector-summary" aria-label="上下文摘要">
          <div><span>估算占用</span><strong>{report.estimatedTokens.toLocaleString()}</strong><small>/ {report.limit.toLocaleString()} tokens</small></div>
          <div><span>发送消息</span><strong>{report.promptMessages.length}</strong><small>含系统与历史消息</small></div>
          <div><span>世界书</span><strong>{report.loreStats.matched}/{report.loreStats.enabled}</strong><small>命中 / 已启用</small></div>
          <div><span>预设模块</span><strong>{report.presetModules.length}</strong><small>{presetName ?? "未应用预设"}</small></div>
        </div>

        <div className="context-inspector-grid">
          <aside className="context-inspector-sources">
            <section>
              <div className="context-inspector-section-title"><strong>启用的预设模块</strong><span>{report.presetModules.length}</span></div>
              {report.presetModules.length > 0 ? report.presetModules.map((module) => (
                <article key={module.id}><i>{module.marker ? "M" : module.position === "system" ? "S" : "P"}</i><span><strong>{module.name}</strong><small>{module.marker ? `结构插槽 · ${module.marker}` : `${module.position === "system" ? "System" : "Post-History"} · 优先级 ${module.priority}`}</small></span><b>{module.estimatedTokens} t</b></article>
              )) : <p>当前没有启用预设模块。</p>}
            </section>
            <section>
              <div className="context-inspector-section-title"><strong>本轮世界书命中</strong><span>{report.matchedLore.length}</span></div>
              {report.matchedLore.length > 0 ? report.matchedLore.map((match) => (
                <details key={match.entry.id}>
                  <summary><span><strong>{match.entry.name}</strong><small>{match.reason} · P{match.entry.priority}</small></span><i>⌄</i></summary>
                  <p>{match.content}</p>
                </details>
              )) : <p>已扫描 {report.loreStats.total} 个条目，没有条目被当前对话触发。</p>}
            </section>
          </aside>

          <section className="context-prompt-sequence">
            <div className="context-inspector-section-title"><strong>最终发送顺序</strong><span>{report.promptMessages.length}</span></div>
            {report.promptMessages.map((message, index) => (
              <details key={message.id} open={index === 0}>
                <summary><i>{String(index + 1).padStart(2, "0")}</i><span><strong>{message.label}</strong><small>{message.role} · {message.estimatedTokens} tokens</small></span><b>⌄</b></summary>
                <pre>{message.content}</pre>
              </details>
            ))}
          </section>
        </div>
      </section>
    </div>
  );
}
