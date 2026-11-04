"use client";

import { FormEvent, useMemo, useState } from "react";
import { useLunemirRuntime } from "../hooks/useLunemirRuntime";

type Section = "chat" | "characters" | "lore" | "themes" | "settings";
type PhoneApp = "messages" | "album" | "notes" | "settings";

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
  const [importOpen, setImportOpen] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [theme, setTheme] = useState("moon");
  const [draft, setDraft] = useState("");
  const [personaName, setPersonaName] = useState("");
  const [personaDescription, setPersonaDescription] = useState("");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingMessageText, setEditingMessageText] = useState("");

  const pageTitle = useMemo(
    () => navItems.find((item) => item.id === section)?.label ?? "对话",
    [section],
  );

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || runtime.streaming) return;
    setDraft("");
    void runtime.sendMessage(content);
  }

  const activeName = runtime.activeCharacter?.nickname || runtime.activeCharacter?.name || "Lunemir";
  const tokenUsage = runtime.contextReport
    ? Math.min(100, Math.round(runtime.contextReport.estimatedTokens / runtime.contextReport.limit * 100))
    : 0;

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
    <main className="lunemir-app" data-theme={theme}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <aside className="side-rail glass-panel" aria-label="主导航">
        <button className="brand-mark" onClick={() => setSection("chat")} aria-label="返回 Lunemir 对话">
          <span className="brand-crescent" />
        </button>
        <nav className="rail-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={section === item.id ? "rail-button is-active" : "rail-button"}
              onClick={() => setSection(item.id)}
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
            <button className="icon-button" onClick={() => setImportOpen(true)} aria-label="导入内容">＋</button>
            <button className="icon-button context-toggle" onClick={() => setContextOpen(!contextOpen)} aria-label="切换上下文面板">⌘</button>
          </div>
        </header>

        {section === "chat" && (
          <div className="chat-stage">
            <div className="scene-header">
              <div className="scene-art"><CharacterOrb avatarDataUrl={runtime.activeCharacter?.avatarDataUrl} name={activeName} /></div>
              <div className="scene-copy">
                <span className="eyebrow">ACTIVE CHARACTER · {runtime.activeCharacter?.specVersion ?? "LOCAL"}</span>
                <h2>{activeName}</h2>
                <p>{runtime.activeCharacter?.scenario || runtime.activeCharacter?.description || "等待故事开始"}</p>
              </div>
              <button className="chapter-button">消息记录 <span>{runtime.messages.length}</span></button>
            </div>

            <div className="message-list" aria-live="polite">
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
                      {message.role === "assistant" && index === runtime.messages.length - 1 && <button onClick={() => void runtime.regenerateLastReply()}>重新生成</button>}
                    </div>
                  )}
                </article>
              ))}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <button type="button" className="composer-tool" aria-label="添加附件">＋</button>
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
              <button className="primary-button" onClick={() => setImportOpen(true)}>导入角色卡</button>
            </div>
            <div className="character-grid">
              {runtime.characters.map((character, index) => (
                <button key={character.id} className={`character-card ${["violet", "cyan", "rose"][index % 3]} ${runtime.activeCharacter?.id === character.id ? "is-active" : ""}`} onClick={() => { void runtime.selectCharacter(character); setSection("chat"); }}>
                  <span className="card-orb" style={character.avatarDataUrl ? { backgroundImage: `url(${character.avatarDataUrl})` } : undefined}>{character.avatarDataUrl ? "" : character.name.charAt(0)}</span>
                  <span><strong>{character.name}</strong><small>{character.creator || character.tags.slice(0, 2).join(" · ") || character.sourceFormat}</small></span>
                  <em>{runtime.activeCharacter?.id === character.id ? "正在对话" : `${character.spec.toUpperCase()} · 本地`}</em>
                </button>
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
                  <button aria-label={`查看${entry.name}`}>→</button>
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
                <button key={option.id} className={theme === option.id ? "theme-card is-selected" : "theme-card"} onClick={() => setTheme(option.id)}>
                  <span className="theme-preview" style={{ background: `linear-gradient(145deg, ${option.colors.join(",")})` }}><i /><i /></span>
                  <strong>{option.name}</strong><small>{theme === option.id ? "正在使用" : "应用主题"}</small>
                </button>
              ))}
            </div>
            <div className="slider-panel">
              <label>玻璃模糊度 <input type="range" min="4" max="30" defaultValue="18" /></label>
              <label>面板透明度 <input type="range" min="25" max="90" defaultValue="64" /></label>
              <label>圆角强度 <input type="range" min="10" max="32" defaultValue="22" /></label>
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

      <aside className={contextOpen ? "context-panel glass-panel is-open" : "context-panel glass-panel"}>
        <div className="context-heading"><div><span className="eyebrow">CONTEXT</span><h2>真实上下文预估</h2></div><button onClick={() => setContextOpen(false)} aria-label="关闭上下文">×</button></div>
        <div className="token-ring" style={{ background: `conic-gradient(var(--accent) 0 ${tokenUsage}%, rgba(255,255,255,.06) ${tokenUsage}% 100%)` }}><span><strong>{runtime.contextReport?.estimatedTokens.toLocaleString() ?? 0}</strong><small>/ {runtime.contextReport?.limit.toLocaleString() ?? 0} tokens</small></span></div>
        <div className="context-block">
          <div className="block-title"><span>当前人设</span><button onClick={openPersonaEditor}>编辑</button></div>
          <article className="persona-card"><span>{(runtime.activePersona?.name ?? "Y").charAt(0)}</span><div><strong>{runtime.activePersona?.name ?? "旅行者"}</strong><small>正在与 {activeName} 对话</small></div></article>
        </div>
        <div className="context-block">
          <div className="block-title"><span>世界书命中</span><em>{runtime.contextReport?.matchedLore.length ?? 0}</em></div>
          {(runtime.contextReport?.matchedLore ?? []).map((match, index) => <button className="context-item" key={match.entry.id}><i className={["cyan", "violet", "rose"][index % 3]} /><span><strong>{match.entry.name}</strong><small>{match.reason}</small></span><b>P{match.entry.priority}</b></button>)}
          {(runtime.contextReport?.matchedLore.length ?? 0) === 0 && <p className="context-empty">当前消息没有触发世界书条目。</p>}
        </div>
        <div className="context-block memory-block">
          <div className="block-title"><span>上下文组成</span><button>实时计算</button></div>
          {(runtime.contextReport?.segments ?? []).map((segment) => <div className="context-segment" key={segment.id}><span><strong>{segment.label}</strong><small>{segment.detail}</small></span><b>{segment.estimatedTokens} t</b></div>)}
          {(runtime.contextReport?.warnings ?? []).map((warning) => <p className="context-warning" key={warning}>{warning}</p>)}
        </div>
        <div className="context-footer"><span>上下文余量</span><strong>{(runtime.contextReport?.health ?? 100) > 25 ? "良好" : "注意"} · {runtime.contextReport?.health ?? 100}%</strong><div><i style={{ width: `${runtime.contextReport?.health ?? 100}%` }} /></div></div>
      </aside>

      {runtime.runtimeError && <div className="runtime-toast" role="alert"><span>!</span><p>{runtime.runtimeError}</p><button onClick={runtime.clearRuntimeError} aria-label="关闭错误提示">×</button></div>}

      <button className={phoneOpen ? "phone-fab is-active" : "phone-fab"} onClick={() => setPhoneOpen(!phoneOpen)} aria-label="打开悬浮小手机">
        <span className="phone-outline"><i /></span><b>2</b>
      </button>

      <section className={phoneOpen ? "phone-shell is-open" : "phone-shell"} aria-label="Lunemir 悬浮小手机" aria-hidden={!phoneOpen}>
        <div className="phone-frame">
          <div className="phone-status"><span>22:43</span><i /><span>◒</span></div>
          <div className="phone-hero"><small>LUNEMIR PHONE</small><strong>晚安，{runtime.activePersona?.name ?? "旅行者"}</strong><span>{activeName} · 本地会话</span></div>
          <div className="phone-apps">
            {(["messages", "album", "notes", "settings"] as PhoneApp[]).map((app) => {
              const data = { messages: ["✦", "消息"], album: ["◫", "相册"], notes: ["⌑", "备忘"], settings: ["⚙", "设置"] }[app];
              return <button key={app} onClick={() => setPhoneApp(app)} className={phoneApp === app ? "is-active" : ""}><i>{data[0]}</i><span>{data[1]}</span></button>;
            })}
          </div>
          <div className="phone-content">
            {phoneApp === "messages" && <><h3>最近消息</h3><article><span className="mini-avatar">{activeName.charAt(0)}</span><div><strong>{activeName}</strong><p>{runtime.messages.at(-1)?.content.slice(0, 28) || "等待第一条消息"}</p></div><time>本地</time></article></>}
            {phoneApp === "album" && <><h3>剧情相册</h3><div className="album-grid"><span className="moon-photo" /><span className="tower-photo" /><span className="mist-photo" /></div><p className="phone-caption">手机事件引擎将在下一阶段接入</p></>}
            {phoneApp === "notes" && <><h3>备忘录</h3><div className="note-card"><strong>当前角色</strong><p>{activeName} · {runtime.activeCharacter?.sourceFormat}</p></div><div className="note-card"><strong>本地保存</strong><p>聊天记录已经写入 IndexedDB</p></div></>}
            {phoneApp === "settings" && <><h3>手机设置</h3><label className="phone-switch">允许剧情通知 <input type="checkbox" defaultChecked /><i /></label><label className="phone-switch">角色主动消息 <input type="checkbox" defaultChecked /><i /></label><label className="phone-switch">安静时段 <input type="checkbox" /><i /></label></>}
          </div>
          <button className="phone-home" onClick={() => setPhoneOpen(false)} aria-label="关闭手机" />
        </div>
      </section>

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
            <div className="modal-actions"><button onClick={closeImport}>取消</button><button className="primary-button" disabled={!runtime.importPreview} onClick={() => { void runtime.confirmImport(); setImportOpen(false); }}>{importAction}</button></div>
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
            <div className="modal-actions"><button onClick={() => setPersonaOpen(false)}>取消</button><button className="primary-button" onClick={() => { void runtime.savePersonaProfile(personaName, personaDescription); setPersonaOpen(false); }}>保存人设</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
