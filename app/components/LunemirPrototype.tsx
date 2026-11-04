"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { useLunemirRuntime } from "../hooks/useLunemirRuntime";
import { CharacterEditorModal } from "./CharacterEditorModal";

type Section = "chat" | "characters" | "lore" | "themes" | "settings";
type PhoneApp = "messages" | "notes";
type DragTarget = "button" | "panel";
type CharacterEditorTarget = { mode: "create" } | { mode: "edit"; id: string };

const navItems: Array<{ id: Section; icon: string; label: string }> = [
  { id: "chat", icon: "◌", label: "对话" },
  { id: "characters", icon: "◇", label: "角色" },
  { id: "lore", icon: "⌑", label: "世界书" },
  { id: "themes", icon: "✦", label: "主题" },
  { id: "settings", icon: "⚙", label: "设置" },
];

const themeOptions = [
  { id: "moon", name: "Moon Glass", colors: ["#171336", "#9a7cff", "#6edcff"] },
  { id: "aurora", name: "Aurora Mist", colors: ["#071f26", "#54e0bd", "#7ca8ff"] },
  { id: "rose", name: "Rose Nocturne", colors: ["#2a1024", "#ff82be", "#9d86ff"] },
];

function CharacterOrb({ small = false, avatarDataUrl, name }: { small?: boolean; avatarDataUrl?: string; name?: string }) {
  return (
    <span
      className={small ? "character-orb character-orb--small" : "character-orb"}
      style={avatarDataUrl ? { backgroundImage: `url(${avatarDataUrl})` } : undefined}
      aria-label={name}
    >
      {!avatarDataUrl && <><span className="orb-moon" /><span className="orb-glow" /></>}
    </span>
  );
}

export function LunemirPrototype() {
  const runtime = useLunemirRuntime();
  const [section, setSection] = useState<Section>("chat");
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneApp, setPhoneApp] = useState<PhoneApp>("messages");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneButtonPosition, setPhoneButtonPosition] = useState<{ x: number; y: number } | null>(null);
  const [phonePanelPosition, setPhonePanelPosition] = useState<{ x: number; y: number } | null>(null);
  const [draggingPhone, setDraggingPhone] = useState<DragTarget | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [renamingConversationId, setRenamingConversationId] = useState("");
  const [conversationTitle, setConversationTitle] = useState("");
  const [personaOpen, setPersonaOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [characterEditor, setCharacterEditor] = useState<CharacterEditorTarget | null>(null);
  const [draft, setDraft] = useState("");
  const [personaName, setPersonaName] = useState("");
  const [personaDescription, setPersonaDescription] = useState("");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingMessageText, setEditingMessageText] = useState("");
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const phoneMessageListRef = useRef<HTMLDivElement | null>(null);
  const followOutputRef = useRef(true);
  const phoneDragRef = useRef<{
    target: DragTarget;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
    moved: boolean;
  } | null>(null);
  const suppressPhoneClickRef = useRef(false);

  const pageTitle = useMemo(
    () => navItems.find((item) => item.id === section)?.label ?? "对话",
    [section],
  );

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || runtime.streaming) return;
    followOutputRef.current = true;
    setDraft("");
    void runtime.sendMessage(content);
  }

  const activeName = runtime.activeCharacter?.nickname || runtime.activeCharacter?.name || "Lunemir";
  const tokenUsage = runtime.contextReport
    ? Math.min(100, Math.round(runtime.contextReport.estimatedTokens / runtime.contextReport.limit * 100))
    : 0;
  const appearanceStyle = {
    "--glass-blur": `${runtime.appearance.blur}px`,
    "--panel-opacity": runtime.appearance.opacity / 100,
    "--panel-radius": `${runtime.appearance.radius}px`,
  } as CSSProperties;
  const activeBackground = runtime.appearance.backgroundMode === "custom"
    ? runtime.appearance.backgroundImage
    : runtime.appearance.backgroundMode === "character"
      ? runtime.activeCharacter?.avatarDataUrl
      : undefined;
  const pendingMemories = (runtime.activeConversation?.memories ?? []).filter((memory) => memory.status === "candidate");
  const approvedMemories = (runtime.activeConversation?.memories ?? []).filter((memory) => memory.status === "approved");
  const lastMessageContent = runtime.messages.at(-1)?.content ?? "";
  const editorCharacter = characterEditor?.mode === "edit"
    ? runtime.characters.find((character) => character.id === characterEditor.id)
    : undefined;

  useEffect(() => {
    if (section !== "chat" || !followOutputRef.current) return;
    const messageList = messageListRef.current;
    if (!messageList) return;
    messageList.scrollTo({ top: messageList.scrollHeight, behavior: runtime.streaming ? "auto" : "smooth" });
  }, [runtime.messages.length, lastMessageContent, runtime.streaming, section]);

  useEffect(() => {
    if (!phoneOpen || phoneApp !== "messages") return;
    const messageList = phoneMessageListRef.current;
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
  }, [runtime.storyEvents.length, phoneOpen, phoneApp]);

  function beginPhoneDrag(event: ReactPointerEvent<HTMLElement>, target: DragTarget) {
    if (event.button !== 0) return;
    const element = target === "panel"
      ? event.currentTarget.closest<HTMLElement>(".phone-shell")
      : event.currentTarget;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    phoneDragRef.current = {
      target,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
    suppressPhoneClickRef.current = false;
    setDraggingPhone(target);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePhoneDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = phoneDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) drag.moved = true;
    const padding = 8;
    const next = {
      x: Math.min(window.innerWidth - drag.width - padding, Math.max(padding, drag.originX + deltaX)),
      y: Math.min(window.innerHeight - drag.height - padding, Math.max(padding, drag.originY + deltaY)),
    };
    if (drag.target === "button") setPhoneButtonPosition(next);
    else setPhonePanelPosition(next);
  }

  function endPhoneDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = phoneDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressPhoneClickRef.current = drag.target === "button" && drag.moved;
    phoneDragRef.current = null;
    setDraggingPhone(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function closeImport() {
    setImportOpen(false);
    runtime.clearImport();
  }

  function openPersonaEditor() {
    setPersonaName(runtime.activePersona?.name ?? "旅行者");
    setPersonaDescription(runtime.activePersona?.description ?? "");
    setPersonaOpen(true);
  }

  function beginMessageEdit(messageId: string, content: string) {
    setEditingMessageId(messageId);
    setEditingMessageText(content);
  }

  async function saveMessageEdit() {
    if (!editingMessageId || !editingMessageText.trim()) return;
    await runtime.editMessage(editingMessageId, editingMessageText);
    setEditingMessageId("");
    setEditingMessageText("");
  }

  const importAvatar = runtime.importPreview?.kind === "character"
    ? runtime.importPreview.record.avatarDataUrl
    : undefined;
  const importAction = runtime.importPreview
    ? ({ character: "导入角色", lorebook: "导入并启用", preset: "导入并应用" } as const)[runtime.importPreview.kind]
    : "确认导入";

  if (!runtime.ready) {
    return <main className="lunemir-loading"><span className="brand-crescent" /><p>正在打开你的世界…</p></main>;
  }

  return (
    <main className="lunemir-app" data-theme={runtime.appearance.theme} data-glass-mode={runtime.appearance.glassMode} data-section={section} style={appearanceStyle}>
      <div className={activeBackground ? "scene-background has-image" : "scene-background"} style={activeBackground ? { backgroundImage: `url("${activeBackground}")` } : undefined} />
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <aside className="side-rail glass-panel" aria-label="主导航">
        <div className="brand-mark" aria-hidden="true">
          <span className="brand-crescent" />
        </div>
        <nav className="rail-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={section === item.id ? "rail-button is-active" : "rail-button"}
              onClick={() => { setSection(item.id); if (item.id !== "chat") setContextOpen(false); }}
              aria-label={item.label}
              aria-current={section === item.id ? "page" : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>
              <small>{item.label}</small>
            </button>
          ))}
        </nav>
        <button className="profile-button" onClick={openPersonaEditor} aria-label={`用户人设：${runtime.activePersona?.name ?? "旅行者"}`}>
          {(runtime.activePersona?.name ?? "Y").charAt(0).toUpperCase()}
        </button>
      </aside>

      <section className="workspace glass-panel">
        <header className="top-bar">
          <div className="top-title">
            {section === "chat" ? <CharacterOrb small avatarDataUrl={runtime.activeCharacter?.avatarDataUrl} name={activeName} /> : <span className="section-glyph">{navItems.find((item) => item.id === section)?.icon}</span>}
            <div>
              <p>{section === "chat" ? `${runtime.activeCharacter?.spec.toUpperCase() ?? "CARD"} · ${runtime.activeCharacter?.sourceFormat.toUpperCase() ?? "LOCAL"}` : "LUNEMIR"}</p>
              <h1>{section === "chat" ? `与 ${activeName} 的对话` : pageTitle}</h1>
            </div>
          </div>
          <div className="top-actions">
            <span className="secure-state"><i /> IndexedDB 已就绪</span>
            {section === "chat" && <>
              <button className="icon-button" onClick={() => setSessionOpen(true)} aria-label="打开会话与记忆管理">≡</button>
              <button className="icon-button" onClick={() => setImportOpen(true)} aria-label="导入角色卡、世界书或预设">＋</button>
              <button className="icon-button context-toggle" onClick={() => setContextOpen(!contextOpen)} aria-label="切换上下文面板">⌘</button>
            </>}
          </div>
        </header>

        {section === "chat" && (
          <div className="chat-stage">
            <div
              className="message-list"
              aria-live="polite"
              ref={messageListRef}
              onScroll={(event) => {
                const target = event.currentTarget;
                followOutputRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 140;
              }}
            >
              <div className="date-divider"><span>今天</span></div>
              {runtime.messages.length === 0 && <div className="empty-chat"><span>◌</span><strong>故事还没有开始</strong><p>发送第一条消息，或为角色设置一条开场白。</p></div>}
              {runtime.messages.map((message, index) => message.status === "streaming" && !message.content ? (
                <div key={message.id} className="typing-bubble" aria-label={`${activeName} 正在输入`}><i /><i /><i /></div>
              ) : (
                <article key={message.id} className={message.role === "user" ? "message user-message" : "message character-message"}>
                  <div className="message-meta">
                    <strong>{message.role === "user" ? runtime.activePersona?.name ?? "You" : activeName}</strong>
                    <time>{new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
                    {message.editedAt && <em>已编辑</em>}
                    {message.status === "stopped" && <em>已停止</em>}
                    {message.status === "error" && <em>失败</em>}
                  </div>
                  {editingMessageId === message.id ? (
                    <div className="message-editor">
                      <textarea value={editingMessageText} onChange={(event) => setEditingMessageText(event.target.value)} rows={4} autoFocus />
                      <span><button onClick={() => setEditingMessageId("")}>取消</button><button onClick={() => void saveMessageEdit()}>保存</button></span>
                    </div>
                  ) : <p>{message.content}</p>}
                  {!runtime.streaming && editingMessageId !== message.id && (
                    <div className="message-actions">
                      <button onClick={() => beginMessageEdit(message.id, message.content)}>编辑</button>
                      <button onClick={() => void runtime.branchConversation(message.id)}>从这里分支</button>
                      <button onClick={() => void runtime.addMemoryCandidate(message.id)} disabled={(runtime.activeConversation?.memories ?? []).some((memory) => memory.sourceMessageId === message.id)}>{(runtime.activeConversation?.memories ?? []).some((memory) => memory.sourceMessageId === message.id) ? "已加入记忆" : "记住"}</button>
                      <button className="danger-action" onClick={() => { if (window.confirm("删除这条消息？相关章节点与待确认记忆也会一并移除。")) void runtime.deleteMessage(message.id); }}>删除</button>
                      {message.role === "assistant" && index === runtime.messages.length - 1 && <><button onClick={() => void runtime.continueLastReply()}>继续生成</button><button onClick={() => void runtime.regenerateLastReply()}>重新生成</button></>}
                    </div>
                  )}
                  {(message.alternatives?.length ?? 0) > 1 && editingMessageId !== message.id && (
                    <div className="message-versions" aria-label="回复版本切换">
                      <button
                        onClick={() => void runtime.selectMessageAlternative(message.id, Math.max(0, (message.activeAlternative ?? 0) - 1))}
                        disabled={(message.activeAlternative ?? 0) === 0 || runtime.streaming}
                        aria-label="上一个回复版本"
                      >‹</button>
                      <span>{(message.activeAlternative ?? 0) + 1} / {message.alternatives?.length}</span>
                      <button
                        onClick={() => void runtime.selectMessageAlternative(message.id, Math.min((message.alternatives?.length ?? 1) - 1, (message.activeAlternative ?? 0) + 1))}
                        disabled={(message.activeAlternative ?? 0) >= (message.alternatives?.length ?? 1) - 1 || runtime.streaming}
                        aria-label="下一个回复版本"
                      >›</button>
                    </div>
                  )}
                </article>
              ))}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <label className="composer-field">
                <span className="sr-only">输入消息</span>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="写下你想说的话…"
                  rows={1}
                />
                <span>Enter 发送 · Shift + Enter 换行</span>
              </label>
              <button
                className={runtime.streaming ? "send-button is-stopping" : "send-button"}
                type={runtime.streaming ? "button" : "submit"}
                onClick={runtime.streaming ? runtime.stopGeneration : undefined}
                disabled={!runtime.streaming && !draft.trim()}
                aria-label={runtime.streaming ? "停止生成" : "发送消息"}
              >{runtime.streaming ? "■" : "↗"}</button>
            </form>
          </div>
        )}

        {section === "characters" && (
          <div className="content-view">
            <div className="view-heading">
              <div><span className="eyebrow">CHARACTER LIBRARY</span><h2>与你产生联系的人</h2></div>
              <button className="primary-button" onClick={() => setCharacterEditor({ mode: "create" })}>新建角色</button>
            </div>
            <div className="character-grid">
              {runtime.characters.map((character, index) => (
                <article className="character-card-shell" key={character.id}>
                  <button className={`character-card ${["violet", "cyan", "rose"][index % 3]} ${runtime.activeCharacter?.id === character.id ? "is-active" : ""}`} onClick={() => { void runtime.selectCharacter(character); setSection("chat"); }}>
                    <span className="card-orb" style={character.avatarDataUrl ? { backgroundImage: `url(${character.avatarDataUrl})` } : undefined}>{character.avatarDataUrl ? "" : character.name.charAt(0)}</span>
                    <span className="character-card-copy"><strong>{character.name}</strong><small>{character.creator || character.tags.slice(0, 2).join(" · ") || character.sourceFormat}</small><p>{character.scenario || character.description || "暂未填写角色设定"}</p></span>
                    <em>{runtime.activeCharacter?.id === character.id ? "正在对话" : `${character.spec.toUpperCase()} · 本地`}</em>
                  </button>
                  <button className="character-manage" onClick={() => setCharacterEditor({ mode: "edit", id: character.id })}>管理</button>
                </article>
              ))}
              <button className="character-card empty" onClick={() => setImportOpen(true)}>
                <span className="card-orb">＋</span><span><strong>导入新角色</strong><small>PNG / JSON</small></span><em>不会覆盖已有角色</em>
              </button>
            </div>
          </div>
        )}

        {section === "lore" && (
          <div className="content-view">
            <div className="view-heading">
              <div><span className="eyebrow">LOREBOOKS</span><h2>让世界拥有连续的记忆</h2></div>
              <button className="primary-button" onClick={() => setImportOpen(true)}>导入世界书</button>
            </div>
            <div className="lore-list">
              {(runtime.activeCharacter?.lorebookEntries.length ?? 0) > 0 && <span className="lore-section-label">角色卡内嵌世界书</span>}
              {(runtime.activeCharacter?.lorebookEntries ?? []).map((entry, index) => (
                <article className="lore-row" key={entry.id}>
                  <span className="lore-color" style={{ background: ["#a990ff", "#69dcff", "#ff90c7"][index % 3] }} />
                  <div><strong>{entry.name}</strong><small>{entry.constant ? "常驻条目" : `${entry.keys.length} 个关键词`} · 优先级 {entry.priority}</small></div>
                  <div className="lore-meter"><i style={{ width: `${Math.min(100, 25 + entry.priority * .7)}%` }} /></div>
                </article>
              ))}
              {runtime.lorebooks.length > 0 && <span className="lore-section-label">独立世界书 · 点击控制当前角色是否启用</span>}
              {runtime.lorebooks.map((book, index) => {
                const enabled = runtime.activeLorebooks.some((item) => item.id === book.id);
                return (
                  <article className={enabled ? "lore-row standalone is-enabled" : "lore-row standalone"} key={book.id}>
                    <span className="lore-color" style={{ background: ["#69dcff", "#a990ff", "#ff90c7"][index % 3] }} />
                    <div><strong>{book.name}</strong><small>{book.entries.length} 个条目 · {book.sourceName}</small></div>
                    <div className="lore-meter"><i style={{ width: `${Math.min(100, 18 + book.entries.length * 4)}%` }} /></div>
                    <button className="lore-toggle" onClick={() => void runtime.toggleLorebookAssignment(book.id)}>{enabled ? "已启用" : "启用"}</button>
                  </article>
                );
              })}
              {(runtime.activeCharacter?.lorebookEntries.length ?? 0) === 0 && runtime.lorebooks.length === 0 && <div className="empty-state"><span>⌑</span><strong>还没有世界书</strong><p>导入 World Info JSON 后会自动为当前角色启用。</p></div>}
            </div>
          </div>
        )}

        {section === "themes" && (
          <div className="content-view">
            <div className="view-heading">
              <div><span className="eyebrow">APPEARANCE</span><h2>把这个世界变成你的样子</h2></div>
              <span className="subtle-label">实时预览</span>
            </div>
            <div className="theme-grid">
              {themeOptions.map((option) => (
                <button key={option.id} className={runtime.appearance.theme === option.id ? "theme-card is-selected" : "theme-card"} onClick={() => void runtime.saveAppearance({ ...runtime.appearance, theme: option.id as "moon" | "aurora" | "rose" })}>
                  <span className="theme-preview" style={{ background: `linear-gradient(145deg, ${option.colors.join(",")})` }}><i /><i /></span>
                  <strong>{option.name}</strong><small>{runtime.appearance.theme === option.id ? "正在使用" : "应用主题"}</small>
                </button>
              ))}
            </div>
            <div className="appearance-mode-grid">
              <section className="appearance-mode-card">
                <div><span className="eyebrow">GLASS LAYOUT</span><h3>毛玻璃范围</h3><p>全屏模式更统一；消息框模式会露出更多背景，更适合沉浸式聊天。</p></div>
                <div className="segmented-control">
                  <button className={runtime.appearance.glassMode === "full" ? "is-active" : ""} onClick={() => void runtime.saveAppearance({ ...runtime.appearance, glassMode: "full" })}>全屏毛玻璃</button>
                  <button className={runtime.appearance.glassMode === "messages" ? "is-active" : ""} onClick={() => void runtime.saveAppearance({ ...runtime.appearance, glassMode: "messages" })}>消息框毛玻璃</button>
                </div>
              </section>
              <section className="appearance-mode-card">
                <div><span className="eyebrow">SCENE BACKGROUND</span><h3>聊天背景</h3><p>背景只保存在当前设备；角色卡没有图片时会自动使用 Lunemir 默认渐变。</p></div>
                <div className="background-actions">
                  <button className={runtime.appearance.backgroundMode === "character" ? "is-active" : ""} onClick={() => void runtime.saveAppearance({ ...runtime.appearance, backgroundMode: "character" })}>角色卡图片</button>
                  <button className={runtime.appearance.backgroundMode === "gradient" ? "is-active" : ""} onClick={() => void runtime.saveAppearance({ ...runtime.appearance, backgroundMode: "gradient" })}>默认渐变</button>
                  <label className={runtime.appearance.backgroundMode === "custom" ? "is-active" : ""}>自定义图片<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void runtime.saveCustomBackground(file); event.currentTarget.value = ""; }} /></label>
                </div>
              </section>
            </div>
            <div className="slider-panel">
              <label><span>玻璃模糊度 <b>{runtime.appearance.blur}px</b></span><input type="range" min="4" max="36" value={runtime.appearance.blur} onChange={(event) => runtime.previewAppearance({ ...runtime.appearance, blur: Number(event.target.value) })} onPointerUp={(event) => void runtime.saveAppearance({ ...runtime.appearance, blur: Number(event.currentTarget.value) })} onKeyUp={(event) => void runtime.saveAppearance({ ...runtime.appearance, blur: Number(event.currentTarget.value) })} /></label>
              <label><span>面板透明度 <b>{runtime.appearance.opacity}%</b></span><input type="range" min="25" max="92" value={runtime.appearance.opacity} onChange={(event) => runtime.previewAppearance({ ...runtime.appearance, opacity: Number(event.target.value) })} onPointerUp={(event) => void runtime.saveAppearance({ ...runtime.appearance, opacity: Number(event.currentTarget.value) })} onKeyUp={(event) => void runtime.saveAppearance({ ...runtime.appearance, opacity: Number(event.currentTarget.value) })} /></label>
              <label><span>圆角强度 <b>{runtime.appearance.radius}px</b></span><input type="range" min="10" max="36" value={runtime.appearance.radius} onChange={(event) => runtime.previewAppearance({ ...runtime.appearance, radius: Number(event.target.value) })} onPointerUp={(event) => void runtime.saveAppearance({ ...runtime.appearance, radius: Number(event.currentTarget.value) })} onKeyUp={(event) => void runtime.saveAppearance({ ...runtime.appearance, radius: Number(event.currentTarget.value) })} /></label>
            </div>
          </div>
        )}

        {section === "settings" && (
          <div className="content-view settings-view">
            <div className="view-heading"><div><span className="eyebrow">MODEL CONNECTION</span><h2>连接你的语言模型</h2></div><span className={`status-pill ${runtime.connectionStatus}`}>{({ idle: "未测试", testing: "测试中", connected: "已连接", error: "连接失败" })[runtime.connectionStatus]}</span></div>
            <div className="settings-card">
              <label>接口类型<select value="compatible" disabled><option value="compatible">OpenAI-compatible</option></select></label>
              <label>API 地址<input value={runtime.modelConfig.baseUrl} onChange={(event) => runtime.setModelConfig({ ...runtime.modelConfig, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" /></label>
              <label>API Key<input type="password" value={runtime.apiKey} onChange={(event) => runtime.setApiKey(event.target.value)} placeholder="仅保留到本页面关闭" autoComplete="off" /></label>
              <label>模型 ID<input value={runtime.modelConfig.model} onChange={(event) => runtime.setModelConfig({ ...runtime.modelConfig, model: event.target.value })} placeholder="model-name" list="available-models" /><datalist id="available-models">{runtime.availableModels.map((model) => <option key={model} value={model} />)}</datalist></label>
              <label>温度<input type="number" min="0" max="2" step="0.1" value={runtime.modelConfig.temperature} onChange={(event) => runtime.setModelConfig({ ...runtime.modelConfig, temperature: Number(event.target.value) })} /></label>
              <label>最大输出 Tokens<input type="number" min="64" max="32000" step="64" value={runtime.modelConfig.maxTokens} onChange={(event) => runtime.setModelConfig({ ...runtime.modelConfig, maxTokens: Number(event.target.value) })} /></label>
              <label>上下文窗口<input type="number" min="1024" max="2000000" step="1024" value={runtime.modelConfig.contextLimit} onChange={(event) => runtime.setModelConfig({ ...runtime.modelConfig, contextLimit: Number(event.target.value) })} /></label>
              <div className="settings-actions"><p>API Key 仅保存在内存中；自定义接口需要允许浏览器跨域访问。</p><div><button onClick={() => void runtime.saveModel()}>保存配置</button><button className="primary-button" onClick={() => void runtime.testConnection()} disabled={runtime.connectionStatus === "testing"}>{runtime.connectionStatus === "testing" ? "正在测试…" : "测试连接"}</button></div></div>
            </div>
            <div className="data-card preset-card">
              <div><span className="eyebrow">PROMPT PRESET</span><h3>提示词预设</h3><p>导入聊天预设会读取已启用的系统提示词，并应用 Temperature、输出长度和上下文窗口。</p></div>
              <div><select value={runtime.activePreset?.id ?? ""} onChange={(event) => void runtime.activatePreset(event.target.value)} aria-label="选择提示词预设"><option value="">不使用预设</option>{runtime.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select><button onClick={() => setImportOpen(true)}>导入预设</button></div>
            </div>
            <div className="data-card">
              <div><span className="eyebrow">LOCAL DATA</span><h3>本地数据与备份</h3><p>角色、聊天和设置保存在当前浏览器。导出备份后可以迁移到其他设备。</p></div>
              <div><button onClick={() => void runtime.downloadBackup()}>导出备份</button><label className="restore-button">恢复备份<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file && window.confirm("恢复备份会替换当前浏览器中的 Lunemir 数据，是否继续？")) void runtime.restoreFromBackup(file); event.currentTarget.value = ""; }} /></label></div>
            </div>
          </div>
        )}
      </section>

      {section === "chat" && <aside className={contextOpen ? "context-panel glass-panel is-open" : "context-panel glass-panel"}>
        <div className="context-heading"><div><span className="eyebrow">CONTEXT</span><h2>真实上下文预估</h2></div><button onClick={() => setContextOpen(false)} aria-label="关闭上下文">×</button></div>
        <div className="token-ring" style={{ background: `conic-gradient(var(--accent) 0 ${tokenUsage}%, rgba(255,255,255,.06) ${tokenUsage}% 100%)` }}><span><strong>{runtime.contextReport?.estimatedTokens.toLocaleString() ?? 0}</strong><small>/ {runtime.contextReport?.limit.toLocaleString() ?? 0} tokens</small></span></div>
        <div className="context-block">
          <div className="block-title"><span>当前人设</span></div>
          <article className="persona-card"><span>{(runtime.activePersona?.name ?? "Y").charAt(0)}</span><div><strong>{runtime.activePersona?.name ?? "旅行者"}</strong><small>正在与 {activeName} 对话</small></div></article>
        </div>
        <div className="context-block">
          <div className="block-title"><span>世界书命中</span><em>{runtime.contextReport?.matchedLore.length ?? 0}</em></div>
          {(runtime.contextReport?.matchedLore ?? []).map((match, index) => <article className="context-item" key={match.entry.id}><i className={["cyan", "violet", "rose"][index % 3]} /><span><strong>{match.entry.name}</strong><small>{match.reason}</small></span><b>P{match.entry.priority}</b></article>)}
          {(runtime.contextReport?.matchedLore.length ?? 0) === 0 && <p className="context-empty">当前消息没有触发世界书条目。</p>}
        </div>
        <div className="context-block memory-block">
          <div className="block-title"><span>上下文组成</span><em>实时</em></div>
          {(runtime.contextReport?.segments ?? []).map((segment) => <div className="context-segment" key={segment.id}><span><strong>{segment.label}</strong><small>{segment.detail}</small></span><b>{segment.estimatedTokens} t</b></div>)}
          {(runtime.contextReport?.warnings ?? []).map((warning) => <p className="context-warning" key={warning}>{warning}</p>)}
        </div>
        <div className="context-footer"><span>上下文余量</span><strong>{(runtime.contextReport?.health ?? 100) > 25 ? "良好" : "注意"} · {runtime.contextReport?.health ?? 100}%</strong><div><i style={{ width: `${runtime.contextReport?.health ?? 100}%` }} /></div></div>
      </aside>}

      {runtime.runtimeError && <div className="runtime-toast" role="alert"><span>!</span><p>{runtime.runtimeError}</p><button onClick={runtime.clearRuntimeError} aria-label="关闭错误提示">×</button></div>}

      <button
        className={`${phoneOpen ? "phone-fab is-active" : "phone-fab"}${draggingPhone === "button" ? " is-dragging" : ""}`}
        style={phoneButtonPosition ? { left: phoneButtonPosition.x, top: phoneButtonPosition.y, right: "auto", bottom: "auto" } : undefined}
        onPointerDown={(event) => beginPhoneDrag(event, "button")}
        onPointerMove={movePhoneDrag}
        onPointerUp={endPhoneDrag}
        onPointerCancel={endPhoneDrag}
        onClick={() => {
          if (suppressPhoneClickRef.current) { suppressPhoneClickRef.current = false; return; }
          const nextOpen = !phoneOpen;
          setPhoneOpen(nextOpen);
          if (nextOpen && phoneApp === "messages") void runtime.markPhoneEventsRead();
        }}
        aria-label="打开或拖动悬浮小手机"
      >
        <span className="phone-outline"><i /></span>{runtime.unreadPhoneEvents > 0 && <b>{runtime.unreadPhoneEvents}</b>}
      </button>

      <section
        className={`${phoneOpen ? "phone-shell is-open" : "phone-shell"}${draggingPhone === "panel" ? " is-dragging" : ""}`}
        style={phonePanelPosition ? { left: phonePanelPosition.x, top: phonePanelPosition.y, right: "auto", bottom: "auto" } : undefined}
        aria-label="Lunemir 悬浮小手机"
        aria-hidden={!phoneOpen}
      >
        <div className="phone-frame">
          <div className="phone-status" onPointerDown={(event) => beginPhoneDrag(event, "panel")} onPointerMove={movePhoneDrag} onPointerUp={endPhoneDrag} onPointerCancel={endPhoneDrag} title="拖动手机"><span>{new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span><i /><span>◒</span></div>
          <div className="phone-hero"><small>LUNEMIR PHONE</small><strong>晚安，{runtime.activePersona?.name ?? "旅行者"}</strong><span>{runtime.activeConversation?.title ?? `${activeName} · 本地会话`}</span></div>
          <div className="phone-apps">
            {(["messages", "notes"] as PhoneApp[]).map((app) => {
              const data = { messages: ["✦", "消息"], notes: ["⌑", "备忘"] }[app];
              return <button key={app} onClick={() => { setPhoneApp(app); if (app === "messages") void runtime.markPhoneEventsRead(); }} className={phoneApp === app ? "is-active" : ""}><i>{data[0]}</i><span>{data[1]}{app === "messages" && runtime.unreadPhoneEvents > 0 ? ` · ${runtime.unreadPhoneEvents}` : ""}</span></button>;
            })}
          </div>
          <div className="phone-content">
            {phoneApp === "messages" && <div className="phone-chat">
              <div className="phone-chat-heading"><span><strong>{activeName}</strong><small>{runtime.phoneEventStatus === "checking" ? "正在检查剧情事件…" : runtime.phoneEventStatus === "error" ? "联动检查失败，可重试" : "与主剧情共享记录"}</small></span><button disabled={runtime.phoneEventStatus === "checking"} onClick={() => void runtime.requestPhoneEvent()}>{runtime.phoneEventStatus === "checking" ? "…" : "检查新消息"}</button></div>
              <div className="phone-message-list" ref={phoneMessageListRef}>
                {runtime.storyEvents.map((event) => {
                  const incoming = event.eventType === "phone_message_received";
                  return <article className={incoming ? "phone-message incoming" : "phone-message outgoing"} key={event.id}><span>{event.content}</span><time>{new Date(event.storyTime).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}{incoming && event.readAt ? " · 已读" : ""}</time></article>;
                })}
                {runtime.storyEvents.length === 0 && <p className="phone-caption">还没有手机通信。完成一轮主剧情后系统会检查角色是否有理由联系你，也可以手动检查一次。</p>}
              </div>
              <form className="phone-composer" onSubmit={(event) => { event.preventDefault(); const content = phoneDraft.trim(); if (!content) return; setPhoneDraft(""); void runtime.sendPhoneMessage(content); }}>
                <input value={phoneDraft} onChange={(event) => setPhoneDraft(event.target.value)} placeholder={`回复 ${activeName}…`} maxLength={600} />
                <button type="submit" disabled={!phoneDraft.trim()} aria-label="发送手机消息">↑</button>
              </form>
            </div>}
            {phoneApp === "notes" && <><h3>剧情备忘</h3>{(runtime.activeConversation?.checkpoints ?? []).map((checkpoint) => <div className="note-card" key={checkpoint.id}><strong>{checkpoint.label}</strong><p>{new Date(checkpoint.createdAt).toLocaleString("zh-CN")}</p></div>)}{approvedMemories.map((memory) => <div className="note-card" key={memory.id}><strong>长期记忆</strong><p>{memory.content}</p></div>)}{(runtime.activeConversation?.checkpoints?.length ?? 0) === 0 && approvedMemories.length === 0 && <p className="phone-caption">在会话管理中创建章节点，或确认一条长期记忆。</p>}</>}
          </div>
          <button className="phone-home" onClick={() => setPhoneOpen(false)} aria-label="关闭手机" />
        </div>
      </section>

      {sessionOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSessionOpen(false)}>
          <section className="session-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="session-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSessionOpen(false)} aria-label="关闭会话管理">×</button>
            <span className="eyebrow">STORY ARCHIVE</span>
            <h2 id="session-title">会话、章节与记忆</h2>
            <p className="session-intro">会话彼此独立；剧情分支会保留分支点之前的消息。只有确认后的记忆会进入模型上下文。</p>
            <div className="session-toolbar">
              <button className="primary-button" onClick={() => void runtime.createNewConversation()}>新建会话</button>
              <button onClick={() => void runtime.createCheckpoint()}>保存章节点</button>
              <button onClick={runtime.downloadConversation}>导出当前会话</button>
            </div>

            <div className="session-section">
              <div className="session-section-title"><strong>会话存档</strong><span>{runtime.conversations.length}</span></div>
              <div className="session-list">
                {runtime.conversations.map((item) => (
                  <article className={runtime.activeConversation?.id === item.id ? "session-row is-active" : "session-row"} key={item.id}>
                    {renamingConversationId === item.id ? (
                      <div className="session-rename"><input value={conversationTitle} onChange={(event) => setConversationTitle(event.target.value)} maxLength={80} autoFocus /><button onClick={() => { void runtime.renameConversation(item.id, conversationTitle); setRenamingConversationId(""); }}>保存</button><button onClick={() => setRenamingConversationId("")}>取消</button></div>
                    ) : <>
                      <button className="session-select" onClick={() => void runtime.selectConversation(item.id)}>
                        <strong>{item.title}</strong>
                        <small>{item.messages.length} 条消息 · {new Date(item.updatedAt).toLocaleString("zh-CN")}{item.parentConversationId ? " · 剧情分支" : ""}</small>
                      </button>
                      <div className="session-row-actions"><button onClick={() => { setRenamingConversationId(item.id); setConversationTitle(item.title); }}>重命名</button><button onClick={() => { if (window.confirm(`删除会话“${item.title}”？此操作无法撤销。`)) void runtime.deleteConversation(item.id); }}>删除</button></div>
                    </>}
                  </article>
                ))}
              </div>
            </div>

            <div className="session-columns">
              <div className="session-section">
                <div className="session-section-title"><strong>章节点</strong><span>{runtime.activeConversation?.checkpoints?.length ?? 0}</span></div>
                <div className="archive-list">
                  {(runtime.activeConversation?.checkpoints ?? []).map((checkpoint) => <article key={checkpoint.id}><strong>{checkpoint.label}</strong><small>{new Date(checkpoint.createdAt).toLocaleString("zh-CN")}</small></article>)}
                  {(runtime.activeConversation?.checkpoints?.length ?? 0) === 0 && <p>还没有章节点。</p>}
                </div>
              </div>
              <div className="session-section">
                <div className="session-section-title"><strong>长期记忆</strong><span>{pendingMemories.length} 待确认</span></div>
                <div className="memory-queue">
                  {pendingMemories.map((memory) => <article key={memory.id}><p>{memory.content}</p><div><button onClick={() => void runtime.removeMemory(memory.id)}>忽略</button><button className="approve" onClick={() => void runtime.approveMemory(memory.id)}>确认记忆</button></div></article>)}
                  {approvedMemories.map((memory) => <article className="is-approved" key={memory.id}><p>{memory.content}</p><div><span>已进入上下文</span><button onClick={() => void runtime.removeMemory(memory.id)}>移除</button></div></article>)}
                  {pendingMemories.length === 0 && approvedMemories.length === 0 && <p className="memory-empty">在消息操作中选择“记住”，内容会先进入这里等待确认。</p>}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {characterEditor && (
        <CharacterEditorModal
          key={characterEditor.mode === "edit" ? characterEditor.id : "new-character"}
          character={editorCharacter}
          onClose={() => setCharacterEditor(null)}
          onSave={async (values) => {
            const saved = await runtime.saveCharacterProfile(characterEditor.mode === "edit" ? characterEditor.id : undefined, values);
            if (saved) setCharacterEditor(null);
          }}
          onDuplicate={editorCharacter ? async () => {
            const duplicate = await runtime.duplicateCharacter(editorCharacter.id);
            if (duplicate) setCharacterEditor({ mode: "edit", id: duplicate.id });
          } : undefined}
          onExport={editorCharacter ? () => runtime.downloadCharacter(editorCharacter.id) : undefined}
          onDelete={editorCharacter ? async () => {
            if (!window.confirm(`删除角色“${editorCharacter.name}”及其全部会话、手机事件和记忆？此操作无法撤销。`)) return;
            if (await runtime.deleteCharacterProfile(editorCharacter.id)) setCharacterEditor(null);
          } : undefined}
        />
      )}

      {importOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeImport}>
          <section className="import-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={closeImport} aria-label="关闭">×</button>
            <span className="modal-icon">⇧</span>
            <span className="eyebrow">IMPORT CENTER</span>
            <h2 id="import-title">把熟悉的世界带进来</h2>
            <p>自动识别 V1/V2/V3 角色卡、World Info 世界书和聊天预设。导入前会先预览，不会覆盖已有内容。</p>
            <label className="drop-zone">
              <input type="file" accept=".png,.json,application/json,image/png" onChange={(event) => { const file = event.target.files?.[0]; if (file) void runtime.parseImport(file); }} />
              <strong>{runtime.importPreview?.record.sourceName || "拖放文件，或点击选择"}</strong>
              <small>PNG、JSON · 单个文件最大 20 MB</small>
            </label>
            {runtime.importError && <div className="import-result is-error"><i>!</i><span><strong>无法导入</strong><small>{runtime.importError}</small></span></div>}
            {runtime.importPreview && <div className="import-preview"><div className={`preview-avatar ${runtime.importPreview.kind}`} style={importAvatar ? { backgroundImage: `url(${importAvatar})` } : undefined}>{importAvatar ? "" : runtime.importPreview.kind === "character" ? runtime.importPreview.record.name.charAt(0) : runtime.importPreview.kind === "lorebook" ? "⌑" : "✦"}</div><div><span>{runtime.importPreview.detectedFormat}</span><strong>{runtime.importPreview.record.name}</strong><small>{runtime.importPreview.summary}</small></div></div>}
            {runtime.importPreview?.warnings.map((warning) => <p className="import-warning" key={warning}>{warning}</p>)}
            <div className="modal-actions"><button className="primary-button" disabled={!runtime.importPreview} onClick={() => { void runtime.confirmImport(); setImportOpen(false); }}>{importAction}</button></div>
          </section>
        </div>
      )}

      {personaOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPersonaOpen(false)}>
          <section className="persona-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="persona-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setPersonaOpen(false)} aria-label="关闭">×</button>
            <span className="modal-icon">◇</span>
            <span className="eyebrow">USER PERSONA</span>
            <h2 id="persona-title">你想以谁的身份进入故事？</h2>
            <p>人设会作为上下文发送给模型，并在所有角色对话中使用。</p>
            <label>显示名称<input value={personaName} onChange={(event) => setPersonaName(event.target.value)} maxLength={60} /></label>
            <label>人设描述<textarea value={personaDescription} onChange={(event) => setPersonaDescription(event.target.value)} rows={6} placeholder="身份、性格、外貌，以及希望角色如何称呼你…" /></label>
            <div className="modal-actions"><button className="primary-button" onClick={() => { void runtime.savePersonaProfile(personaName, personaDescription); setPersonaOpen(false); }}>保存人设</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
