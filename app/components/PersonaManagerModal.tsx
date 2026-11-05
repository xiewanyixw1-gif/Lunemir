"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { PersonaEditorValues, PersonaRecord } from "../../lib/lunemir/types";

type ManagerProps = {
  personas: PersonaRecord[];
  activePersonaId: string;
  storyLabel: string;
  onClose: () => void;
  onSave: (personaId: string | undefined, values: PersonaEditorValues) => Promise<PersonaRecord | null>;
  onActivate: (personaId: string) => Promise<void> | void;
  onDuplicate: (personaId: string) => Promise<PersonaRecord | null>;
  onDelete: (personaId: string) => Promise<boolean>;
};

type FormProps = {
  persona?: PersonaRecord;
  isActive: boolean;
  onSave: (values: PersonaEditorValues) => Promise<PersonaRecord | null>;
  onActivate?: () => Promise<void> | void;
  onDuplicate?: () => Promise<PersonaRecord | null>;
  onDelete?: () => Promise<boolean>;
  onSaved: (persona: PersonaRecord) => void;
  onDuplicated: (persona: PersonaRecord) => void;
  onDeleted: () => void;
};

function initialValues(persona?: PersonaRecord): PersonaEditorValues {
  return {
    name: persona?.name ?? "",
    description: persona?.description ?? "",
    avatarDataUrl: persona?.avatarDataUrl,
    appearance: persona?.appearance ?? "",
    personality: persona?.personality ?? "",
    identity: persona?.identity ?? "",
    occupation: persona?.occupation ?? "",
    background: persona?.background ?? "",
    relationships: persona?.relationships ?? "",
    currentState: persona?.currentState ?? "",
    notes: persona?.notes ?? "",
  };
}

function PersonaForm({ persona, isActive, onSave, onActivate, onDuplicate, onDelete, onSaved, onDuplicated, onDeleted }: FormProps) {
  const [values, setValues] = useState(() => initialValues(persona));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof PersonaEditorValues>(key: K, value: PersonaEditorValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function selectAvatar(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件。");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("人设头像不能超过 5 MB。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") update("avatarDataUrl", reader.result);
    };
    reader.onerror = () => setError("无法读取头像文件。");
    reader.readAsDataURL(file);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.name.trim()) {
      setError("请填写人设名称。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await onSave(values);
      if (saved) onSaved(saved);
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    if (!onDuplicate || busy) return;
    setBusy(true);
    try {
      const copy = await onDuplicate();
      if (copy) onDuplicated(copy);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!onDelete || !persona || busy) return;
    if (!window.confirm(`删除人设“${persona.name}”？其他剧情中的对应绑定会同时移除。`)) return;
    setBusy(true);
    try {
      if (await onDelete()) onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="persona-editor-form" onSubmit={submit}>
      <div className="persona-editor-profile">
        <div className="avatar-editor">
          <span style={values.avatarDataUrl ? { backgroundImage: `url(${values.avatarDataUrl})` } : undefined}>{values.avatarDataUrl ? "" : values.name.trim().charAt(0) || "◇"}</span>
          <label>选择头像<input type="file" accept="image/*" onChange={(event) => selectAvatar(event.target.files?.[0])} /></label>
          {values.avatarDataUrl ? <button type="button" onClick={() => update("avatarDataUrl", undefined)}>移除</button> : null}
        </div>
        <div className="persona-editor-grid compact">
          <label><span>显示名称 *</span><input value={values.name} onChange={(event) => update("name", event.target.value)} maxLength={80} required /></label>
          <label><span>身份</span><input value={values.identity} onChange={(event) => update("identity", event.target.value)} placeholder="学生、调查员、旅行者…" /></label>
          <label><span>职业</span><input value={values.occupation} onChange={(event) => update("occupation", event.target.value)} /></label>
          <label><span>当前状态</span><input value={values.currentState} onChange={(event) => update("currentState", event.target.value)} placeholder="位置、情绪、身体状态…" /></label>
        </div>
      </div>

      <div className="persona-editor-grid">
        <label className="wide"><span>人设摘要</span><textarea value={values.description} onChange={(event) => update("description", event.target.value)} rows={3} placeholder="最重要的整体设定和互动边界…" /></label>
        <label><span>外貌</span><textarea value={values.appearance} onChange={(event) => update("appearance", event.target.value)} rows={4} /></label>
        <label><span>性格</span><textarea value={values.personality} onChange={(event) => update("personality", event.target.value)} rows={4} /></label>
        <label className="wide"><span>背景经历</span><textarea value={values.background} onChange={(event) => update("background", event.target.value)} rows={4} /></label>
        <label className="wide"><span>与其他角色的关系</span><textarea value={values.relationships} onChange={(event) => update("relationships", event.target.value)} rows={3} /></label>
        <label className="wide"><span>专属设定</span><textarea value={values.notes} onChange={(event) => update("notes", event.target.value)} rows={3} placeholder="称呼、行为边界、希望模型长期遵守的设定…" /></label>
      </div>

      {error ? <p className="character-editor-error" role="alert">{error}</p> : null}
      <div className="character-editor-actions persona-editor-actions">
        <div>{persona ? <><button type="button" onClick={() => void duplicate()}>复制人设</button><button className="danger" type="button" onClick={() => void remove()}>删除人设</button></> : null}</div>
        <span>{persona && !isActive ? <button type="button" onClick={() => void onActivate?.()}>应用到当前剧情</button> : null}<button className="primary-button" type="submit" disabled={busy}>{busy ? "保存中…" : persona ? "保存人设" : "创建并应用"}</button></span>
      </div>
    </form>
  );
}

export function PersonaManagerModal({ personas, activePersonaId, storyLabel, onClose, onSave, onActivate, onDuplicate, onDelete }: ManagerProps) {
  const [selectedId, setSelectedId] = useState(activePersonaId || personas[0]?.id || "");
  const selectedPersona = personas.find((persona) => persona.id === selectedId);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="persona-manager glass-panel" role="dialog" aria-modal="true" aria-labelledby="persona-manager-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="关闭人设管理器">×</button>
        <span className="eyebrow">PERSONA LIBRARY</span>
        <h2 id="persona-manager-title">以不同身份进入故事</h2>
        <p className="persona-manager-intro">当前剧情：{storyLabel} · 每个剧情会记住自己绑定的人设，切换会话时自动恢复。</p>

        <div className="persona-manager-workspace">
          <aside className="persona-library" aria-label="用户人设列表">
            <div className="persona-library-heading"><strong>我的人设</strong><span>{personas.length}</span></div>
            <div className="persona-library-list">
              {personas.map((persona) => (
                <button type="button" className={selectedId === persona.id ? "is-selected" : ""} key={persona.id} onClick={() => setSelectedId(persona.id)} aria-current={activePersonaId === persona.id ? "true" : undefined}>
                  <i style={persona.avatarDataUrl ? { backgroundImage: `url(${persona.avatarDataUrl})` } : undefined}>{persona.avatarDataUrl ? "" : persona.name.charAt(0)}</i>
                  <span><strong>{persona.name}</strong><small>{activePersonaId === persona.id ? "当前剧情正在使用" : persona.identity || persona.occupation || "本地人设"}</small></span>
                </button>
              ))}
            </div>
            <button className="persona-create" type="button" onClick={() => setSelectedId("")}>＋ 新建人设</button>
          </aside>

          <div className="persona-manager-editor">
            <PersonaForm
              key={selectedPersona?.id ?? "new-persona"}
              persona={selectedPersona}
              isActive={selectedPersona?.id === activePersonaId}
              onSave={(values) => onSave(selectedPersona?.id, values)}
              onActivate={selectedPersona ? () => onActivate(selectedPersona.id) : undefined}
              onDuplicate={selectedPersona ? () => onDuplicate(selectedPersona.id) : undefined}
              onDelete={selectedPersona ? () => onDelete(selectedPersona.id) : undefined}
              onSaved={(persona) => setSelectedId(persona.id)}
              onDuplicated={(persona) => setSelectedId(persona.id)}
              onDeleted={() => setSelectedId(personas.find((persona) => persona.id !== selectedPersona?.id)?.id ?? "")}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
