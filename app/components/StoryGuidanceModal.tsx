"use client";

import { useState } from "react";
import type { AuthorNote, StorySummary } from "../../lib/lunemir/types";

type StoryGuidanceProps = {
  authorNote?: AuthorNote;
  storySummary?: StorySummary;
  messageCount: number;
  onClose: () => void;
  onSaveAuthorNote: (values: { content: string; enabled: boolean; position: AuthorNote["position"]; depth: number; durationTurns: number }) => Promise<boolean>;
  onSaveSummary: (content: string, status: StorySummary["status"]) => Promise<boolean>;
  onGenerateSummary: () => Promise<string | null>;
};

export function StoryGuidanceModal({ authorNote, storySummary, messageCount, onClose, onSaveAuthorNote, onSaveSummary, onGenerateSummary }: StoryGuidanceProps) {
  const [noteContent, setNoteContent] = useState(authorNote?.content ?? "");
  const [noteEnabled, setNoteEnabled] = useState(authorNote?.enabled ?? true);
  const [notePosition, setNotePosition] = useState<AuthorNote["position"]>(authorNote?.position ?? "in_history");
  const [noteDepth, setNoteDepth] = useState(authorNote?.depth ?? 4);
  const [durationTurns, setDurationTurns] = useState(authorNote?.expiresAfterMessageCount === undefined ? 0 : Math.max(0, Math.ceil((authorNote.expiresAfterMessageCount - messageCount) / 2)));
  const [summaryContent, setSummaryContent] = useState(storySummary?.content ?? "");
  const [summaryStatus, setSummaryStatus] = useState<StorySummary["status"]>(storySummary?.status ?? "draft");
  const [savingNote, setSavingNote] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("");

  async function saveNote() {
    setSavingNote(true);
    setNotice("");
    try {
      const saved = await onSaveAuthorNote({ content: noteContent, enabled: noteEnabled, position: notePosition, depth: noteDepth, durationTurns });
      if (saved) setNotice(noteContent.trim() ? "作者注释已保存并更新上下文。" : "作者注释已清除。");
    } finally {
      setSavingNote(false);
    }
  }

  async function saveSummary(status: StorySummary["status"]) {
    setSavingSummary(true);
    setNotice("");
    try {
      const saved = await onSaveSummary(summaryContent, status);
      if (saved) {
        setSummaryStatus(status);
        setNotice(status === "confirmed" ? "剧情摘要已确认并进入上下文。" : summaryContent.trim() ? "摘要草稿已保存，尚未发送给模型。" : "剧情摘要已清除。");
      }
    } finally {
      setSavingSummary(false);
    }
  }

  async function generateSummary() {
    setGenerating(true);
    setNotice("");
    try {
      const content = await onGenerateSummary();
      if (content) {
        setSummaryContent(content);
        setSummaryStatus("draft");
        setNotice("AI 已生成摘要草稿，请检查后再确认。");
      }
    } finally {
      setGenerating(false);
    }
  }

  const noteExpired = Boolean(authorNote?.expiresAfterMessageCount !== undefined && authorNote.expiresAfterMessageCount <= messageCount);

  return (
    <div className="modal-backdrop story-guidance-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="glass-panel story-guidance" role="dialog" aria-modal="true" aria-labelledby="story-guidance-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="关闭剧情引导">×</button>
        <span className="eyebrow">STORY GUIDANCE</span>
        <h2 id="story-guidance-title">作者注释与剧情摘要</h2>
        <p className="story-guidance-intro">作者注释控制接下来的写法；剧情摘要替代较早消息。只有已确认摘要会进入模型上下文。</p>

        <div className="story-guidance-grid">
          <section className="story-guidance-card">
            <header><div><span>01</span><h3>作者注释</h3></div><em className={noteEnabled && !noteExpired && noteContent.trim() ? "is-active" : ""}>{noteExpired ? "已失效" : noteEnabled && noteContent.trim() ? "生效中" : "未启用"}</em></header>
            <label className="story-guidance-textarea"><span>临时剧情指令</span><textarea value={noteContent} onChange={(event) => setNoteContent(event.target.value)} rows={8} placeholder="例如：保持第三人称，放慢节奏，强化人物心理活动，不要跳过关键互动。" /></label>
            <div className="story-guidance-fields">
              <label><span>插入位置</span><select value={notePosition} onChange={(event) => setNotePosition(event.target.value as AuthorNote["position"])}><option value="system">系统上下文末尾</option><option value="in_history">对话历史中</option><option value="post_history">历史消息之后</option></select></label>
              <label><span>插入深度</span><input type="number" min={0} max={40} value={noteDepth} onChange={(event) => setNoteDepth(Number(event.target.value))} disabled={notePosition !== "in_history"} /><small>距离最新消息的条数</small></label>
              <label><span>生效轮数</span><input type="number" min={0} max={999} value={durationTurns} onChange={(event) => setDurationTurns(Number(event.target.value))} /><small>0 表示持续生效</small></label>
            </div>
            <div className="story-guidance-toggle"><label><input type="checkbox" checked={noteEnabled} onChange={(event) => setNoteEnabled(event.target.checked)} /><span>启用作者注释</span></label></div>
            <div className="story-guidance-actions"><button type="button" onClick={() => { setNoteContent(""); setNoteEnabled(false); }}>清空</button><button className="primary-button" type="button" onClick={() => void saveNote()} disabled={savingNote}>{savingNote ? "保存中…" : "保存作者注释"}</button></div>
          </section>

          <section className="story-guidance-card">
            <header><div><span>02</span><h3>剧情摘要</h3></div><em className={summaryStatus === "confirmed" && summaryContent.trim() ? "is-active" : ""}>{summaryContent.trim() ? summaryStatus === "confirmed" ? "已进入上下文" : "待确认" : "尚未创建"}</em></header>
            <div className="story-summary-meta"><span>当前会话 {messageCount} 条消息</span><span>{storySummary?.coveredMessageCount ? `摘要覆盖 ${storySummary.coveredMessageCount} 条` : "确认时记录覆盖范围"}</span></div>
            <label className="story-guidance-textarea"><span>可编辑摘要</span><textarea value={summaryContent} onChange={(event) => setSummaryContent(event.target.value)} rows={13} placeholder="记录重要事件、当前场景、人物关系变化、承诺、秘密、未完成事项和伏笔。" /></label>
            <p className="story-summary-warning">确认后，被摘要覆盖的早期消息不再重复发送给模型，可显著减少长剧情上下文占用。</p>
            <div className="story-guidance-actions summary-actions"><button type="button" onClick={() => void generateSummary()} disabled={generating || messageCount === 0}>{generating ? "生成中…" : "AI 生成草稿"}</button><button type="button" onClick={() => void saveSummary("draft")} disabled={savingSummary}>保存草稿</button><button className="primary-button" type="button" onClick={() => void saveSummary("confirmed")} disabled={savingSummary || !summaryContent.trim()}>确认并写入上下文</button></div>
          </section>
        </div>
        {notice ? <p className="story-guidance-notice" role="status">{notice}</p> : null}
      </section>
    </div>
  );
}
