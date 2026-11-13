"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createId } from "../../lib/lunemir/defaults";
import type { LorebookEditorValues, LorebookEntry, LorebookRecord } from "../../lib/lunemir/types";

type Props = {
  lorebook?: LorebookRecord;
  onClose: () => void;
  onSave: (values: LorebookEditorValues) => Promise<void> | void;
  onDuplicate?: () => Promise<void> | void;
  onExport?: () => void;
  onDelete?: () => Promise<void> | void;
};

function createEmptyEntry(index: number): LorebookEntry {
  return {
    id: createId("lore"),
    name: `新条目 ${index + 1}`,
    keys: [],
    secondaryKeys: [],
    content: "",
    enabled: true,
    constant: false,
    selective: false,
    priority: 50,
    insertionOrder: index,
    caseSensitive: false,
    scanDepth: 12,
    probability: 100,
    useProbability: false,
    recursive: false,
    tokenBudget: 0,
    insertionPosition: "after_character",
    insertionDepth: 4,
    extensions: {},
  };
}

function splitKeywords(value: string) {
  return value.split(/[,，\n]/).map((keyword) => keyword.trim()).filter(Boolean);
}

function cloneEntries(entries: LorebookEntry[]) {
  return entries.map((entry) => ({
    ...entry,
    keys: [...entry.keys],
    secondaryKeys: [...entry.secondaryKeys],
    scanDepth: entry.scanDepth ?? 12,
    probability: entry.probability ?? 100,
    useProbability: entry.useProbability ?? false,
    recursive: entry.recursive ?? false,
    tokenBudget: entry.tokenBudget ?? 0,
    insertionPosition: entry.insertionPosition ?? "after_character",
    insertionDepth: entry.insertionDepth ?? 4,
    extensions: { ...entry.extensions },
  }));
}

export function LorebookEditorModal({ lorebook, onClose, onSave, onDuplicate, onExport, onDelete }: Props) {
  const initialEntries = useMemo(
    () => lorebook?.entries.length ? cloneEntries(lorebook.entries) : [createEmptyEntry(0)],
    [lorebook],
  );
  const [name, setName] = useState(lorebook?.name ?? "");
  const [entries, setEntries] = useState(initialEntries);
  const [activeEntryId, setActiveEntryId] = useState(initialEntries[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeIndex = Math.max(0, entries.findIndex((entry) => entry.id === activeEntryId));
  const activeEntry = entries[activeIndex];

  function updateEntry(patch: Partial<LorebookEntry>) {
    setEntries((current) => current.map((entry) => entry.id === activeEntryId ? { ...entry, ...patch } : entry));
  }

  function addEntry() {
    const entry = createEmptyEntry(entries.length);
    setEntries((current) => [...current, entry]);
    setActiveEntryId(entry.id);
  }

  function duplicateEntry() {
    if (!activeEntry) return;
    const duplicate: LorebookEntry = {
      ...activeEntry,
      id: createId("lore"),
      name: `${activeEntry.name} · 副本`,
      keys: [...activeEntry.keys],
      secondaryKeys: [...activeEntry.secondaryKeys],
      extensions: { ...activeEntry.extensions },
      insertionOrder: activeIndex + 1,
    };
    const next = [...entries];
    next.splice(activeIndex + 1, 0, duplicate);
    setEntries(next.map((entry, index) => ({ ...entry, insertionOrder: index })));
    setActiveEntryId(duplicate.id);
  }

  function removeEntry() {
    if (!activeEntry) return;
    if (entries.length === 1) {
      setError("一本世界书至少需要保留一个条目。");
      return;
    }
    const next = entries.filter((entry) => entry.id !== activeEntry.id)
      .map((entry, index) => ({ ...entry, insertionOrder: index }));
    setEntries(next);
    setActiveEntryId(next[Math.min(activeIndex, next.length - 1)].id);
  }

  function moveEntry(direction: -1 | 1) {
    const nextIndex = activeIndex + direction;
    if (!activeEntry || nextIndex < 0 || nextIndex >= entries.length) return;
    const next = [...entries];
    [next[activeIndex], next[nextIndex]] = [next[nextIndex], next[activeIndex]];
    setEntries(next.map((entry, index) => ({ ...entry, insertionOrder: index })));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("请填写世界书名称。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        name: name.trim(),
        entries: entries.map((entry, index) => ({
          ...entry,
          name: entry.name.trim() || `条目 ${index + 1}`,
          content: entry.content.trim(),
          keys: entry.keys.map((key) => key.trim()).filter(Boolean),
          secondaryKeys: entry.secondaryKeys.map((key) => key.trim()).filter(Boolean),
          priority: Number.isFinite(entry.priority) ? entry.priority : 50,
          insertionOrder: index,
        })),
      });
    } finally {
      setBusy(false);
    }
  }

  async function runSecondary(action?: () => Promise<void> | void) {
    if (!action || busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="lorebook-editor glass-panel" role="dialog" aria-modal="true" aria-labelledby="lorebook-editor-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="关闭世界书编辑器">×</button>
        <span className="eyebrow">WORLD INFO EDITOR</span>
        <h2 id="lorebook-editor-title">{lorebook ? `编辑 ${lorebook.name}` : "创建新世界书"}</h2>
        <p className="lorebook-editor-intro">只在对话命中关键词时注入需要的设定。常驻条目会始终进入上下文，请谨慎使用。</p>

        <form onSubmit={submit}>
          <label className="lorebook-name"><span>世界书名称 *</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label>

          <div className="lorebook-editor-workspace">
            <aside className="lorebook-entry-list" aria-label="世界书条目">
              <div className="lorebook-entry-heading"><strong>条目</strong><span>{entries.filter((entry) => entry.enabled).length}/{entries.length} 启用</span></div>
              <div className="lorebook-entry-scroll">
                {entries.map((entry, index) => (
                  <button type="button" className={entry.id === activeEntryId ? "is-active" : ""} key={entry.id} onClick={() => { setActiveEntryId(entry.id); setError(""); }}>
                    <i className={entry.enabled ? "is-enabled" : ""} />
                    <span><strong>{entry.name || `条目 ${index + 1}`}</strong><small>{entry.constant ? "常驻" : entry.keys.slice(0, 2).join("、") || "未设置关键词"}</small></span>
                    <em>{entry.priority}</em>
                  </button>
                ))}
              </div>
              <button className="lorebook-add-entry" type="button" onClick={addEntry}>＋ 新建条目</button>
            </aside>

            {activeEntry && (
              <div className="lorebook-entry-editor">
                <div className="lorebook-entry-toolbar">
                  <span>条目 {activeIndex + 1}</span>
                  <div>
                    <button type="button" onClick={() => moveEntry(-1)} disabled={activeIndex === 0} aria-label="上移条目">↑</button>
                    <button type="button" onClick={() => moveEntry(1)} disabled={activeIndex === entries.length - 1} aria-label="下移条目">↓</button>
                    <button type="button" onClick={duplicateEntry}>复制</button>
                    <button className="danger" type="button" onClick={removeEntry}>删除</button>
                  </div>
                </div>

                <div className="lorebook-entry-grid">
                  <label className="wide"><span>条目标题</span><input value={activeEntry.name} onChange={(event) => updateEntry({ name: event.target.value })} maxLength={160} /></label>
                  <label className="wide"><span>主要关键词</span><input key={`${activeEntry.id}-keys`} defaultValue={activeEntry.keys.join("，")} onBlur={(event) => updateEntry({ keys: splitKeywords(event.target.value) })} placeholder="月港，钟塔，旧城区" /></label>
                  <label className="wide"><span>次要关键词</span><input key={`${activeEntry.id}-secondary-keys`} defaultValue={activeEntry.secondaryKeys.join("，")} onBlur={(event) => updateEntry({ secondaryKeys: splitKeywords(event.target.value) })} placeholder="启用组合触发后，至少命中一个次要关键词" /></label>
                  <label className="wide"><span>注入内容</span><textarea value={activeEntry.content} onChange={(event) => updateEntry({ content: event.target.value })} rows={10} placeholder="模型需要知道的世界设定、人物关系或事件事实…" /></label>
                  <label><span>优先级</span><input type="number" min={-1000} max={1000} value={activeEntry.priority} onChange={(event) => updateEntry({ priority: Number(event.target.value) })} /></label>
                  <label><span>顺序</span><input value={activeIndex + 1} disabled aria-label="当前插入顺序" /></label>
                  <label><span>扫描深度</span><input type="number" min={1} max={100} value={activeEntry.scanDepth ?? 12} onChange={(event) => updateEntry({ scanDepth: Number(event.target.value) })} /><small>只扫描最近多少条消息</small></label>
                  <label><span>触发概率 %</span><input type="number" min={0} max={100} value={activeEntry.probability ?? 100} onChange={(event) => updateEntry({ probability: Number(event.target.value) })} disabled={!activeEntry.useProbability} /><small>同一段上下文结果保持稳定</small></label>
                  <label><span>条目 Token 预算</span><input type="number" min={0} max={32000} value={activeEntry.tokenBudget ?? 0} onChange={(event) => updateEntry({ tokenBudget: Number(event.target.value) })} /><small>0 表示不限制</small></label>
                  <label><span>注入位置</span><select value={activeEntry.insertionPosition ?? "after_character"} onChange={(event) => updateEntry({ insertionPosition: event.target.value as LorebookEntry["insertionPosition"] })}><option value="before_character">角色定义之前</option><option value="after_character">角色定义之后</option><option value="in_history">聊天历史中</option></select><small>兼容世界书 Before / After / At Depth</small></label>
                  <label><span>历史注入深度</span><input type="number" min={0} max={100} value={activeEntry.insertionDepth ?? 4} onChange={(event) => updateEntry({ insertionDepth: Number(event.target.value) })} disabled={activeEntry.insertionPosition !== "in_history"} /><small>0 表示最近一条消息之后</small></label>
                </div>

                <div className="lorebook-switches">
                  <label><input type="checkbox" checked={activeEntry.enabled} onChange={(event) => updateEntry({ enabled: event.target.checked })} /><span><strong>启用条目</strong><small>关闭后不参与匹配</small></span></label>
                  <label><input type="checkbox" checked={activeEntry.constant} onChange={(event) => updateEntry({ constant: event.target.checked })} /><span><strong>常驻</strong><small>无需关键词也会注入</small></span></label>
                  <label><input type="checkbox" checked={activeEntry.selective} onChange={(event) => updateEntry({ selective: event.target.checked })} /><span><strong>组合触发</strong><small>主要与次要关键词同时命中</small></span></label>
                  <label><input type="checkbox" checked={activeEntry.caseSensitive} onChange={(event) => updateEntry({ caseSensitive: event.target.checked })} /><span><strong>区分大小写</strong><small>适合英文专有名词</small></span></label>
                  <label><input type="checkbox" checked={activeEntry.useProbability ?? false} onChange={(event) => updateEntry({ useProbability: event.target.checked })} /><span><strong>概率触发</strong><small>按上方概率稳定判断</small></span></label>
                  <label><input type="checkbox" checked={activeEntry.recursive ?? false} onChange={(event) => updateEntry({ recursive: event.target.checked })} /><span><strong>递归触发</strong><small>允许已命中条目触发本条目</small></span></label>
                </div>
              </div>
            )}
          </div>

          {error && <p className="character-editor-error" role="alert">{error}</p>}
          <div className="character-editor-actions">
            <div>{lorebook ? <>{onDuplicate ? <button type="button" onClick={() => void runSecondary(onDuplicate)}>复制世界书</button> : null}{onExport ? <button type="button" onClick={onExport}>导出 JSON</button> : null}{onDelete ? <button className="danger" type="button" onClick={() => void runSecondary(onDelete)}>删除世界书</button> : null}</> : null}</div>
            <span><button type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "保存中…" : "保存世界书"}</button></span>
          </div>
        </form>
      </section>
    </div>
  );
}
