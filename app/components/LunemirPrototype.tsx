"use client";

import { FormEvent, useMemo, useRef, useState } from "react";

type Section = "chat" | "characters" | "lore" | "themes" | "settings";
type PhoneApp = "messages" | "album" | "notes" | "settings";

type ChatMessage = {
  id: number;
  author: "Seren" | "You";
  body: string;
  time: string;
};

const navItems: Array<{ id: Section; icon: string; label: string }> = [
  { id: "chat", icon: "◌", label: "对话" },
  { id: "characters", icon: "◇", label: "角色" },
  { id: "lore", icon: "⌑", label: "世界书" },
  { id: "themes", icon: "✦", label: "主题" },
  { id: "settings", icon: "⚙", label: "设置" },
];

const starterMessages: ChatMessage[] = [
  {
    id: 1,
    author: "Seren",
    body: "你终于来了。雨刚停，整座城都像被月光重新擦拭过一遍。",
    time: "22:41",
  },
  {
    id: 2,
    author: "You",
    body: "我在旧钟塔下面。你说要给我看的东西呢？",
    time: "22:42",
  },
  {
    id: 3,
    author: "Seren",
    body: "先别抬头。打开我留在你手机里的那张照片——门只会为知道它名字的人出现。",
    time: "22:42",
  },
];

const characters = [
  { name: "Seren Vale", note: "月港档案员", status: "正在对话", tone: "violet" },
  { name: "Iris Noct", note: "梦境观测者", status: "12 分钟前", tone: "cyan" },
  { name: "Rowan", note: "边境信使", status: "昨天", tone: "rose" },
  { name: "新角色", note: "导入或从空白创建", status: "", tone: "empty" },
];

const loreEntries = [
  { title: "月港 · 城市设定", entries: 28, active: 5, color: "#a990ff" },
  { title: "旧钟塔与无名门", entries: 12, active: 3, color: "#69dcff" },
  { title: "角色关系与称呼", entries: 16, active: 4, color: "#ff90c7" },
];

const themeOptions = [
  { id: "moon", name: "Moon Glass", colors: ["#171336", "#9a7cff", "#6edcff"] },
  { id: "aurora", name: "Aurora Mist", colors: ["#071f26", "#54e0bd", "#7ca8ff"] },
  { id: "rose", name: "Rose Nocturne", colors: ["#2a1024", "#ff82be", "#9d86ff"] },
];

function CharacterOrb({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "character-orb character-orb--small" : "character-orb"}>
      <span className="orb-moon" />
      <span className="orb-glow" />
    </span>
  );
}

export function LunemirPrototype() {
  const [section, setSection] = useState<Section>("chat");
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneApp, setPhoneApp] = useState<PhoneApp>("messages");
  const [importOpen, setImportOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [theme, setTheme] = useState("moon");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [typing, setTyping] = useState(false);
  const [selectedFile, setSelectedFile] = useState("");
  const nextId = useRef(10);

  const pageTitle = useMemo(
    () => navItems.find((item) => item.id === section)?.label ?? "对话",
    [section],
  );

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || typing) return;

    setMessages((current) => [
      ...current,
      { id: nextId.current++, author: "You", body: content, time: "现在" },
    ]);
    setDraft("");
    setTyping(true);

    window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          author: "Seren",
          body: "我听见了。把这句话留在这里吧——月港会记得我们今晚说过的每一件事。",
          time: "现在",
        },
      ]);
      setTyping(false);
    }, 720);
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
        <button className="profile-button" aria-label="用户人设：旅行者">
          Y
        </button>
      </aside>

      <section className="workspace glass-panel">
        <header className="top-bar">
          <div className="top-title">
            {section === "chat" ? <CharacterOrb small /> : <span className="section-glyph">{navItems.find((item) => item.id === section)?.icon}</span>}
            <div>
              <p>{section === "chat" ? "SEREN VALE" : "LUNEMIR"}</p>
              <h1>{section === "chat" ? "旧钟塔下的约定" : pageTitle}</h1>
            </div>
          </div>
          <div className="top-actions">
            <span className="secure-state"><i /> 本地存储</span>
            <button className="icon-button" onClick={() => setImportOpen(true)} aria-label="导入内容">＋</button>
            <button className="icon-button context-toggle" onClick={() => setContextOpen(!contextOpen)} aria-label="切换上下文面板">⌘</button>
          </div>
        </header>

        {section === "chat" && (
          <div className="chat-stage">
            <div className="scene-header">
              <div className="scene-art"><CharacterOrb /></div>
              <div className="scene-copy">
                <span className="eyebrow">CHAPTER 04 · MOONHARBOR</span>
                <h2>雨后的门</h2>
                <p>深夜 22:42 · 旧城区 · 微冷</p>
              </div>
              <button className="chapter-button">章节记录 <span>08</span></button>
            </div>

            <div className="message-list" aria-live="polite">
              <div className="date-divider"><span>今天</span></div>
              {messages.map((message) => (
                <article key={message.id} className={message.author === "You" ? "message user-message" : "message character-message"}>
                  <div className="message-meta">
                    <strong>{message.author}</strong>
                    <time>{message.time}</time>
                  </div>
                  <p>{message.body}</p>
                  {message.id === 3 && (
                    <button className="memory-chip" onClick={() => setPhoneOpen(true)}>
                      <span>◫</span> 已发送到 Lunemir Phone · 查看照片
                    </button>
                  )}
                </article>
              ))}
              {typing && <div className="typing-bubble" aria-label="Seren 正在输入"><i /><i /><i /></div>}
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
              <button className="send-button" type="submit" disabled={!draft.trim() || typing} aria-label="发送消息">↗</button>
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
              {characters.map((character, index) => (
                <button key={character.name} className={`character-card ${character.tone}`} onClick={() => index === 0 ? setSection("chat") : setImportOpen(index === 3)}>
                  <span className="card-orb">{index === 3 ? "+" : character.name.charAt(0)}</span>
                  <span><strong>{character.name}</strong><small>{character.note}</small></span>
                  <em>{character.status}</em>
                </button>
              ))}
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
              {loreEntries.map((book) => (
                <article className="lore-row" key={book.title}>
                  <span className="lore-color" style={{ background: book.color }} />
                  <div><strong>{book.title}</strong><small>{book.entries} 个条目 · 当前命中 {book.active} 个</small></div>
                  <div className="lore-meter"><i style={{ width: `${32 + book.active * 9}%` }} /></div>
                  <button aria-label={`打开${book.title}`}>→</button>
                </article>
              ))}
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
            <div className="view-heading"><div><span className="eyebrow">MODEL CONNECTION</span><h2>连接你的语言模型</h2></div><span className="status-pill">未连接</span></div>
            <div className="settings-card">
              <label>接口类型<select defaultValue="compatible"><option value="compatible">OpenAI-compatible</option><option value="local">Local endpoint</option></select></label>
              <label>API 地址<input defaultValue="https://api.example.com/v1" /></label>
              <label>API Key<input type="password" placeholder="仅保存在当前设备" /></label>
              <label>模型 ID<input placeholder="model-name" /></label>
              <div className="settings-actions"><p>密钥不会写入 GitHub 仓库。</p><button className="primary-button">测试连接</button></div>
            </div>
          </div>
        )}
      </section>

      <aside className={contextOpen ? "context-panel glass-panel is-open" : "context-panel glass-panel"}>
        <div className="context-heading"><div><span className="eyebrow">CONTEXT</span><h2>本轮上下文</h2></div><button onClick={() => setContextOpen(false)} aria-label="关闭上下文">×</button></div>
        <div className="token-ring"><span><strong>8.4k</strong><small>/ 32k tokens</small></span></div>
        <div className="context-block">
          <div className="block-title"><span>当前人设</span><button>编辑</button></div>
          <article className="persona-card"><span>Y</span><div><strong>旅行者</strong><small>与 Seren 相识 17 天</small></div></article>
        </div>
        <div className="context-block">
          <div className="block-title"><span>世界书命中</span><em>5</em></div>
          <button className="context-item"><i className="cyan" /><span><strong>旧钟塔</strong><small>关键词：钟塔、门</small></span><b>96%</b></button>
          <button className="context-item"><i className="violet" /><span><strong>月港宵禁</strong><small>常驻 · 优先级 80</small></span><b>100%</b></button>
          <button className="context-item"><i className="rose" /><span><strong>无名门</strong><small>递归命中</small></span><b>74%</b></button>
        </div>
        <div className="context-block memory-block">
          <div className="block-title"><span>长期记忆</span><button>查看全部</button></div>
          <p>Seren 曾答应在满月时带你进入旧档案馆。</p>
          <small>2 个相关记忆已加入</small>
        </div>
        <div className="context-footer"><span>上下文健康度</span><strong>良好 · 82%</strong><div><i /></div></div>
      </aside>

      <button className={phoneOpen ? "phone-fab is-active" : "phone-fab"} onClick={() => setPhoneOpen(!phoneOpen)} aria-label="打开悬浮小手机">
        <span className="phone-outline"><i /></span><b>2</b>
      </button>

      <section className={phoneOpen ? "phone-shell is-open" : "phone-shell"} aria-label="Lunemir 悬浮小手机" aria-hidden={!phoneOpen}>
        <div className="phone-frame">
          <div className="phone-status"><span>22:43</span><i /><span>◒</span></div>
          <div className="phone-hero"><small>LUNEMIR PHONE</small><strong>晚安，旅行者</strong><span>月港 · 11°C</span></div>
          <div className="phone-apps">
            {(["messages", "album", "notes", "settings"] as PhoneApp[]).map((app) => {
              const data = { messages: ["✦", "消息"], album: ["◫", "相册"], notes: ["⌑", "备忘"], settings: ["⚙", "设置"] }[app];
              return <button key={app} onClick={() => setPhoneApp(app)} className={phoneApp === app ? "is-active" : ""}><i>{data[0]}</i><span>{data[1]}</span></button>;
            })}
          </div>
          <div className="phone-content">
            {phoneApp === "messages" && <><h3>最近消息</h3><article><span className="mini-avatar">S</span><div><strong>Seren</strong><p>照片已经发给你了。</p></div><time>刚刚</time></article><article><span className="mini-avatar iris">I</span><div><strong>Iris</strong><p>今晚的梦有一点不同。</p></div><time>12m</time></article></>}
            {phoneApp === "album" && <><h3>剧情相册</h3><div className="album-grid"><span className="moon-photo" /><span className="tower-photo" /><span className="mist-photo" /></div><p className="phone-caption">Seren 刚刚分享了 1 张照片</p></>}
            {phoneApp === "notes" && <><h3>备忘录</h3><div className="note-card"><strong>进入无名门之前</strong><p>找到门的真名 · 不要抬头 · 带上银色钥匙</p></div><div className="note-card"><strong>下次满月</strong><p>与 Seren 在旧档案馆见面</p></div></>}
            {phoneApp === "settings" && <><h3>手机设置</h3><label className="phone-switch">允许剧情通知 <input type="checkbox" defaultChecked /><i /></label><label className="phone-switch">角色主动消息 <input type="checkbox" defaultChecked /><i /></label><label className="phone-switch">安静时段 <input type="checkbox" /><i /></label></>}
          </div>
          <button className="phone-home" onClick={() => setPhoneOpen(false)} aria-label="关闭手机" />
        </div>
      </section>

      {importOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setImportOpen(false)}>
          <section className="import-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setImportOpen(false)} aria-label="关闭">×</button>
            <span className="modal-icon">⇧</span>
            <span className="eyebrow">IMPORT CENTER</span>
            <h2 id="import-title">把熟悉的世界带进来</h2>
            <p>支持角色卡 PNG / JSON、世界书和预设。导入前会显示字段预览，不会直接覆盖已有内容。</p>
            <label className="drop-zone">
              <input type="file" accept=".png,.json" onChange={(event) => setSelectedFile(event.target.files?.[0]?.name ?? "")} />
              <strong>{selectedFile || "拖放文件，或点击选择"}</strong>
              <small>PNG、JSON · 单个文件最大 20 MB</small>
            </label>
            {selectedFile && <div className="import-result"><i>✓</i><span><strong>文件已识别</strong><small>下一步将进入字段预览与冲突检查</small></span></div>}
            <div className="modal-actions"><button onClick={() => setImportOpen(false)}>取消</button><button className="primary-button" disabled={!selectedFile}>继续预览</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
