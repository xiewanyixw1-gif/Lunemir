"use client";

import { useMemo, useState } from "react";
import { replaceRoleMacros } from "../../lib/lunemir/macros";
import type { CharacterRecord } from "../../lib/lunemir/types";

type Props = {
  character: CharacterRecord;
  personaName?: string;
  currentGreeting?: string;
  createsNewConversation: boolean;
  onClose: () => void;
  onApply: (greeting: string) => Promise<void> | void;
};

export function GreetingPickerModal({ character, personaName, currentGreeting, createsNewConversation, onClose, onApply }: Props) {
  const greetings = useMemo(
    () => [...new Set([character.firstMessage, ...character.alternateGreetings].map((greeting) => greeting.trim()).filter(Boolean))],
    [character.alternateGreetings, character.firstMessage],
  );
  const [selectedGreeting, setSelectedGreeting] = useState(
    () => greetings.includes(currentGreeting?.trim() ?? "") ? currentGreeting?.trim() ?? "" : greetings[0] ?? "",
  );
  const [busy, setBusy] = useState(false);

  async function applyGreeting() {
    if (!selectedGreeting || busy) return;
    setBusy(true);
    try {
      await onApply(selectedGreeting);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop greeting-picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="greeting-picker glass-panel" role="dialog" aria-modal="true" aria-labelledby="greeting-picker-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="关闭开场白选择器">×</button>
        <div className="greeting-picker-heading">
          <span className="greeting-picker-avatar" style={character.avatarDataUrl ? { backgroundImage: `url(${character.avatarDataUrl})` } : undefined}>{character.avatarDataUrl ? "" : character.name.charAt(0)}</span>
          <div><span className="eyebrow">OPENING MESSAGE</span><h2 id="greeting-picker-title">选择 {character.nickname || character.name} 的开场白</h2></div>
        </div>
        <p className="greeting-picker-intro">角色卡共提供 {greetings.length} 条开场白。选择后会作为这段故事的第一条角色消息。</p>
        {createsNewConversation ? <p className="greeting-picker-note">当前故事已经开始。应用新开场白会创建一个独立会话，不会覆盖现有聊天记录。</p> : null}
        <div className="greeting-options" role="radiogroup" aria-label="角色开场白">
          {greetings.map((greeting, index) => {
            const selected = greeting === selectedGreeting;
            return (
              <button key={`${index}-${greeting.slice(0, 24)}`} type="button" className={selected ? "greeting-option is-selected" : "greeting-option"} role="radio" aria-checked={selected} onClick={() => setSelectedGreeting(greeting)}>
                <span className="greeting-option-index">{index === 0 ? "默认" : `备选 ${index}`}</span>
                <p>{replaceRoleMacros(greeting, character.nickname || character.name, personaName)}</p>
                <em>{selected ? "已选择" : "选择"}</em>
              </button>
            );
          })}
        </div>
        <footer className="greeting-picker-actions"><button onClick={onClose}>取消</button><button className="primary-button" onClick={() => void applyGreeting()} disabled={!selectedGreeting || busy}>{busy ? "应用中…" : createsNewConversation ? "以此新建会话" : "应用开场白"}</button></footer>
      </section>
    </div>
  );
}
