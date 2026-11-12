"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { normalizeEmbeddedOutputRenderer } from "../../lib/lunemir/output-renderer";
import type { CharacterEditorValues, CharacterRecord } from "../../lib/lunemir/types";

type Props = {
  character?: CharacterRecord;
  onClose: () => void;
  onSave: (values: CharacterEditorValues) => Promise<void> | void;
  onDuplicate?: () => Promise<void> | void;
  onExport?: () => void;
  onDelete?: () => Promise<void> | void;
};

function initialValues(character?: CharacterRecord): CharacterEditorValues {
  return {
    name: character?.name ?? "",
    nickname: character?.nickname ?? "",
    signature: character?.signature ?? "",
    description: character?.description ?? "",
    personality: character?.personality ?? "",
    scenario: character?.scenario ?? "",
    firstMessage: character?.firstMessage ?? "",
    alternateGreetings: character?.alternateGreetings ?? [],
    exampleMessages: character?.exampleMessages ?? "",
    systemPrompt: character?.systemPrompt ?? "",
    postHistoryInstructions: character?.postHistoryInstructions ?? "",
    tags: character?.tags ?? [],
    creator: character?.creator ?? "",
    characterVersion: character?.characterVersion ?? "1.0",
    creatorNotes: character?.creatorNotes ?? "",
    avatarDataUrl: character?.avatarDataUrl,
    embeddedRendererEnabled: character?.embeddedRendererEnabled !== false,
  };
}

export function CharacterEditorModal({ character, onClose, onSave, onDuplicate, onExport, onDelete }: Props) {
  const [values, setValues] = useState(() => initialValues(character));
  const embeddedRenderer = normalizeEmbeddedOutputRenderer(character?.extensions);
  const [tags, setTags] = useState(values.tags.join("，"));
  const [alternateGreetings, setAlternateGreetings] = useState(values.alternateGreetings.join("\n\n---\n\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof CharacterEditorValues>(key: K, value: CharacterEditorValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.name.trim()) {
      setError("请填写角色名称。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...values,
        alternateGreetings: alternateGreetings
          .split(/\r?\n\s*---+\s*\r?\n/)
          .map((greeting) => greeting.trim())
          .filter(Boolean),
        tags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
      });
    } finally {
      setBusy(false);
    }
  }

  function selectAvatar(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件。");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("角色头像不能超过 5 MB。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") update("avatarDataUrl", reader.result);
    };
    reader.onerror = () => setError("无法读取头像文件。");
    reader.readAsDataURL(file);
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
      <section className="character-editor glass-panel" role="dialog" aria-modal="true" aria-labelledby="character-editor-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="关闭角色编辑器">×</button>
        <span className="eyebrow">CHARACTER CARD</span>
        <h2 id="character-editor-title">{character ? `编辑 ${character.name}` : "创建新角色"}</h2>
        <p className="character-editor-intro">这些字段会直接进入角色上下文。保存角色不会覆盖已有聊天记录。</p>

        <form onSubmit={submit}>
          <div className="character-editor-profile">
            <div className="avatar-editor">
              <span style={values.avatarDataUrl ? { backgroundImage: `url(${values.avatarDataUrl})` } : undefined}>{values.avatarDataUrl ? "" : values.name.trim().charAt(0) || "◇"}</span>
              <label>选择头像<input type="file" accept="image/*" onChange={(event) => selectAvatar(event.target.files?.[0])} /></label>
              {values.avatarDataUrl && <button type="button" onClick={() => update("avatarDataUrl", undefined)}>移除</button>}
            </div>
            <div className="character-editor-grid compact">
              <label><span>角色名称 *</span><input value={values.name} onChange={(event) => update("name", event.target.value)} maxLength={100} required /></label>
              <label><span>昵称</span><input value={values.nickname} onChange={(event) => update("nickname", event.target.value)} maxLength={100} /></label>
              <label className="wide"><span>个性签名</span><input value={values.signature} onChange={(event) => update("signature", event.target.value)} maxLength={120} placeholder="显示在聊天顶部和侧边故事信息中" /><small>仅用于界面展示，不会替代角色开场白。</small></label>
              <label><span>创作者</span><input value={values.creator} onChange={(event) => update("creator", event.target.value)} maxLength={100} /></label>
              <label><span>版本</span><input value={values.characterVersion} onChange={(event) => update("characterVersion", event.target.value)} maxLength={40} /></label>
              <label className="wide"><span>标签</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="奇幻，现代，慢热" /></label>
            </div>
          </div>

          <div className="character-editor-grid">
            <label className="wide"><span>人物描述</span><textarea value={values.description} onChange={(event) => update("description", event.target.value)} rows={5} placeholder="外貌、身份、背景、经历和当前状态…" /></label>
            <label><span>性格与行为逻辑</span><textarea value={values.personality} onChange={(event) => update("personality", event.target.value)} rows={5} placeholder="性格、语言习惯、行为边界…" /></label>
            <label><span>当前剧情场景</span><textarea value={values.scenario} onChange={(event) => update("scenario", event.target.value)} rows={5} /></label>
            <label className="wide"><span>开场白</span><textarea value={values.firstMessage} onChange={(event) => update("firstMessage", event.target.value)} rows={5} /></label>
            <label className="wide"><span>备选开场白</span><textarea value={alternateGreetings} onChange={(event) => setAlternateGreetings(event.target.value)} rows={8} placeholder="每条备选开场白之间使用单独一行 --- 分隔" /><small>导入角色卡中的 alternate_greetings 会显示在这里，也可以自行增删。</small></label>
            <label className="wide"><span>示例对话</span><textarea value={values.exampleMessages} onChange={(event) => update("exampleMessages", event.target.value)} rows={5} placeholder="{{char}}：…\n{{user}}：…" /></label>
          </div>

          <details className="character-advanced">
            <summary>高级提示词</summary>
            <div className="character-editor-grid">
              <label className="wide"><span>角色专属 System Prompt</span><textarea value={values.systemPrompt} onChange={(event) => update("systemPrompt", event.target.value)} rows={4} /></label>
              <label className="wide"><span>Post-History Instructions</span><textarea value={values.postHistoryInstructions} onChange={(event) => update("postHistoryInstructions", event.target.value)} rows={4} /></label>
              <label className="wide"><span>创作者备注</span><textarea value={values.creatorNotes} onChange={(event) => update("creatorNotes", event.target.value)} rows={3} /></label>
            </div>
          </details>

          {embeddedRenderer ? (
            <label className="character-renderer-toggle">
              <input
                type="checkbox"
                checked={values.embeddedRendererEnabled !== false}
                onChange={(event) => update("embeddedRendererEnabled", event.target.checked)}
              />
              <span>
                <strong>启用角色卡自带状态栏与美化</strong>
                <small>检测到 {embeddedRenderer.regexRules.length} 条角色专属 Regex。启用后优先于预设和 Lunemir 原生状态栏，并在消息内隔离渲染。</small>
              </span>
            </label>
          ) : null}

          {error && <p className="character-editor-error" role="alert">{error}</p>}
          <div className="character-editor-actions">
            <div>{character && <><button type="button" onClick={() => void runSecondary(onDuplicate)}>复制角色</button><button type="button" onClick={onExport}>导出 V2 JSON</button><button className="danger" type="button" onClick={() => void runSecondary(onDelete)}>删除角色</button></>}</div>
            <span><button type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "保存中…" : "保存角色"}</button></span>
          </div>
        </form>
      </section>
    </div>
  );
}
