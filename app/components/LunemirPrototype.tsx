"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { normalizeOutputRenderer } from "../../lib/lunemir/output-renderer";
import { replaceRoleMacros } from "../../lib/lunemir/macros";
import type { LorebookRecord } from "../../lib/lunemir/types";
import { useLunemirRuntime } from "../hooks/useLunemirRuntime";
import { CharacterEditorModal } from "./CharacterEditorModal";
import { ChatAppearancePanel } from "./ChatAppearancePanel";
import { ContextInspectorModal } from "./ContextInspectorModal";
import { GlassPanel } from "./GlassPanel";
import { GreetingPickerModal } from "./GreetingPickerModal";
import { LorebookEditorModal } from "./LorebookEditorModal";
import { PersonaManagerModal } from "./PersonaManagerModal";
import { PresetEditorModal } from "./PresetEditorModal";
import { SafeMessageContent } from "./SafeMessageContent";
import { StoryGuidanceModal } from "./StoryGuidanceModal";
import { StoryTimelineModal } from "./StoryTimelineModal";

type Section = "chat" | "characters" | "lore" | "presets" | "themes" | "settings";
type PhoneApp = "home" | "messages" | "contacts" | "story" | "notes" | "studio" | "settings";
type PhoneMessageView = "list" | "chat";
type DragTarget = "button" | "panel";
type CharacterEditorTarget = { mode: "create" } | { mode: "edit"; id: string };
type LorebookEditorTarget = { mode: "create" } | { mode: "edit"; id: string } | { mode: "embedded"; characterId: string };
type PresetEditorTarget = { mode: "create" } | { mode: "edit"; id: string };

const navItems: Array<{ id: Section; icon: string; label: string }> = [
  { id: "chat", icon: "◌", label: "对话" },
  { id: "characters", icon: "◇", label: "角色" },
  { id: "lore", icon: "⌑", label: "世界书" },
  { id: "presets", icon: "≋", label: "预设" },
  { id: "themes", icon: "✦", label: "外观" },
  { id: "settings", icon: "⌬", label: "设置" },
];

const phoneApps: Array<{ id: Exclude<PhoneApp, "home">; icon: string; label: string; tone: string }> = [
  { id: "messages", icon: "●●", label: "消息", tone: "green" },
  { id: "contacts", icon: "人", label: "联系人", tone: "blue" },
  { id: "story", icon: "⌁", label: "剧情", tone: "violet" },
  { id: "notes", icon: "▤", label: "备忘录", tone: "gold" },
  { id: "studio", icon: "✦", label: "创作", tone: "rose" },
  { id: "settings", icon: "⚙", label: "设置", tone: "gray" },
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

function MessageAvatar({ image, name, side }: { image?: string; name: string; side: "character" | "user" }) {
  return (
    <span
      className={`message-avatar ${side}-avatar`}
      style={image ? { backgroundImage: `url(${image})` } : undefined}
      aria-label={`${name}的头像`}
    >{image ? "" : name.charAt(0).toUpperCase()}</span>
  );
}

function messageDayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  return sameDay ? "今天" : date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
}

type LibraryAction = {
  label: string;
  onSelect: () => void | Promise<void>;
  danger?: boolean;
};

function LibraryActionMenu({ label, actions }: { label: string; actions: LibraryAction[] }) {
  return (
    <details className="library-action-menu">
      <summary aria-label={label}>•••</summary>
      <div>
        {actions.map((action) => (
          <button
            className={action.danger ? "danger" : ""}
            type="button"
            key={action.label}
            onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              void action.onSelect();
            }}
          >{action.label}</button>
        ))}
      </div>
    </details>
  );
}

function LibrarySearch({ label, value, count, onChange }: { label: string; value: string; count: number; onChange: (value: string) => void }) {
  return (
    <label className="library-search">
      <span aria-hidden="true">⌕</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} aria-label={label} />
      <small>{count}</small>
    </label>
  );
}

export function LunemirPrototype() {
  const runtime = useLunemirRuntime();
  const [section, setSection] = useState<Section>("chat");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneApp, setPhoneApp] = useState<PhoneApp>("home");
  const [phoneMessageView, setPhoneMessageView] = useState<PhoneMessageView>("list");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneContactQuery, setPhoneContactQuery] = useState("");
  const [phoneCharacterId, setPhoneCharacterId] = useState("");
  const [phoneButtonPosition, setPhoneButtonPosition] = useState<{ x: number; y: number } | null>(null);
  const [phonePanelPosition, setPhonePanelPosition] = useState<{ x: number; y: number } | null>(null);
  const [draggingPhone, setDraggingPhone] = useState<DragTarget | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [renamingConversationId, setRenamingConversationId] = useState("");
  const [conversationTitle, setConversationTitle] = useState("");
  const [sessionQuery, setSessionQuery] = useState("");
  const [personaOpen, setPersonaOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextInspectorOpen, setContextInspectorOpen] = useState(false);
  const [storyGuidanceOpen, setStoryGuidanceOpen] = useState(false);
  const [storyTimelineOpen, setStoryTimelineOpen] = useState(false);
  const [greetingPickerOpen, setGreetingPickerOpen] = useState(false);
  const [characterEditor, setCharacterEditor] = useState<CharacterEditorTarget | null>(null);
  const [lorebookEditor, setLorebookEditor] = useState<LorebookEditorTarget | null>(null);
  const [presetEditor, setPresetEditor] = useState<PresetEditorTarget | null>(null);
  const [characterQuery, setCharacterQuery] = useState("");
  const [loreQuery, setLoreQuery] = useState("");
  const [presetQuery, setPresetQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingMessageText, setEditingMessageText] = useState("");
  const [rawMessageIds, setRawMessageIds] = useState<Set<string>>(() => new Set());
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const messageListRef = useRef<HTMLElement | null>(null);
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
  const phonePositionRef = useRef<{
    button: { x: number; y: number } | null;
    panel: { x: number; y: number } | null;
  }>({ button: null, panel: null });

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
    const textarea = event.currentTarget.querySelector("textarea");
    if (textarea) textarea.style.height = "auto";
    void runtime.sendMessage(content);
  }

  const activeName = runtime.activeCharacter?.nickname || runtime.activeCharacter?.name || "Lunemir";
  const activeSignature = runtime.activeCharacter?.signature?.trim() ?? "";
  const activeConversationTitle = replaceRoleMacros(runtime.activeConversation?.title ?? "当前剧情", activeName, runtime.activePersona?.name ?? "用户");
  const phoneStoryTime = runtime.storyState?.currentTime ?? runtime.activeConversation?.createdAt ?? "1970-01-01T00:00:00.000Z";
  const greetingOptions = useMemo(
    () => [...new Set([
      runtime.activeCharacter?.firstMessage ?? "",
      ...(runtime.activeCharacter?.alternateGreetings ?? []),
    ].map((greeting) => greeting.trim()).filter(Boolean))],
    [runtime.activeCharacter],
  );
  const currentOpeningGreeting = runtime.messages[0]?.role === "assistant" ? runtime.messages[0].content : "";
  const greetingCreatesNewConversation = runtime.messages.length > 1 || runtime.messages.some((message) => message.role === "user");
  const tokenUsage = runtime.contextReport
    ? Math.min(100, Math.round(runtime.contextReport.estimatedTokens / runtime.contextReport.limit * 100))
    : 0;
  const appearanceStyle = {
    "--glass-blur": `${runtime.appearance.glassBlur}px`,
    "--panel-opacity": runtime.appearance.glassOpacity / 100,
    "--panel-radius": `${runtime.appearance.radius}px`,
    "--lm-glass-opacity": runtime.appearance.glassOpacity / 100,
    "--lm-glass-blur": `${runtime.appearance.glassBlur}px`,
    "--lm-glass-border-opacity": runtime.appearance.glassBorderOpacity / 100,
    "--lm-glass-highlight": runtime.appearance.glassHighlight / 100,
    "--lm-glass-shadow": runtime.appearance.glassShadow / 100,
    "--lm-background-brightness": `${runtime.appearance.backgroundBrightness}%`,
    "--lm-background-blur": `${runtime.appearance.backgroundBlur}px`,
    "--lm-background-overlay": runtime.appearance.backgroundOverlay / 100,
    "--lm-background-vignette": runtime.appearance.backgroundVignette / 100,
    "--lm-background-fit": runtime.appearance.backgroundFit,
    "--lm-background-scale": runtime.appearance.backgroundScale / 100,
    "--lm-background-position-x": `${runtime.appearance.backgroundPositionX}%`,
    "--lm-background-position-y": `${runtime.appearance.backgroundPositionY}%`,
    "--lm-avatar-size": `${runtime.appearance.avatarSize}px`,
    "--lm-avatar-gap": `${runtime.appearance.avatarGap}px`,
    "--lm-message-font-size": `${runtime.appearance.fontSize}px`,
    "--lm-message-font-weight": runtime.appearance.fontWeight,
    "--lm-message-line-height": runtime.appearance.lineHeight,
    "--lm-paragraph-spacing": `${runtime.appearance.paragraphSpacing}px`,
    "--lm-chat-max-width": `${runtime.appearance.messageMaxWidth}px`,
    "--lm-mobile-reading-inset": `${runtime.appearance.mobileReadingInset}px`,
    "--lm-phone-width": `${350 * runtime.appearance.phoneScale / 100}px`,
    "--lm-phone-height": `${720 * runtime.appearance.phoneScale / 100}px`,
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
  const embeddedLorebookCharacter = lorebookEditor?.mode === "embedded"
    ? runtime.characters.find((character) => character.id === lorebookEditor.characterId)
    : undefined;
  const editorLorebook = lorebookEditor?.mode === "edit"
    ? runtime.lorebooks.find((lorebook) => lorebook.id === lorebookEditor.id)
    : embeddedLorebookCharacter
      ? {
          id: `embedded-${embeddedLorebookCharacter.id}`,
          schemaVersion: 1 as const,
          name: embeddedLorebookCharacter.lorebookName || `${embeddedLorebookCharacter.name} · 内嵌世界书`,
          sourceName: `${embeddedLorebookCharacter.name} 角色卡`,
          entries: embeddedLorebookCharacter.lorebookEntries,
          raw: {},
          createdAt: embeddedLorebookCharacter.createdAt,
          updatedAt: embeddedLorebookCharacter.updatedAt,
        } satisfies LorebookRecord
      : undefined;
  const editorPreset = presetEditor?.mode === "edit"
    ? runtime.presets.find((preset) => preset.id === presetEditor.id)
    : undefined;
  const activePresetId = runtime.activePreset?.id ?? "";
  const activeOutputRenderer = useMemo(
    () => runtime.activePreset ? normalizeOutputRenderer(runtime.activePreset.outputRenderer) : null,
    [runtime.activePreset],
  );
  const filteredCharacters = useMemo(() => {
    const query = characterQuery.trim().toLocaleLowerCase();
    if (!query) return runtime.characters;
    return runtime.characters.filter((character) => [
      character.name,
      character.nickname,
      character.creator,
      character.description,
      character.scenario,
      character.tags.join(" "),
    ].join(" ").toLocaleLowerCase().includes(query));
  }, [characterQuery, runtime.characters]);
  const embeddedLorebooks = useMemo(() => runtime.characters.filter((character) => character.lorebookEntries.length > 0), [runtime.characters]);
  const filteredEmbeddedLorebooks = useMemo(() => {
    const query = loreQuery.trim().toLocaleLowerCase();
    if (!query) return embeddedLorebooks;
    return embeddedLorebooks.filter((character) => [character.name, character.lorebookName, ...character.lorebookEntries.flatMap((entry) => [entry.name, entry.content, ...entry.keys])].join(" ").toLocaleLowerCase().includes(query));
  }, [embeddedLorebooks, loreQuery]);
  const filteredLorebooks = useMemo(() => {
    const query = loreQuery.trim().toLocaleLowerCase();
    if (!query) return runtime.lorebooks;
    return runtime.lorebooks.filter((book) => [book.name, book.sourceName, ...book.entries.flatMap((entry) => [entry.name, entry.content, ...entry.keys])].join(" ").toLocaleLowerCase().includes(query));
  }, [loreQuery, runtime.lorebooks]);
  const filteredPresets = useMemo(() => {
    const query = presetQuery.trim().toLocaleLowerCase();
    if (!query) return runtime.presets;
    return runtime.presets.filter((preset) => [preset.name, preset.sourceName, ...(preset.modules ?? []).flatMap((module) => [module.name, module.content])].join(" ").toLocaleLowerCase().includes(query));
  }, [presetQuery, runtime.presets]);
  const filteredConversations = useMemo(() => {
    const query = sessionQuery.trim().toLocaleLowerCase();
    if (!query) return runtime.conversations;
    return runtime.conversations.filter((item) => [item.title, ...item.messages.slice(-8).map((message) => message.content)].join(" ").toLocaleLowerCase().includes(query));
  }, [runtime.conversations, sessionQuery]);
  const phoneThreads = useMemo(() => runtime.characters.map((character) => {
    const characterStories = runtime.allConversations
      .filter((item) => item.characterId === character.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const story = character.id === runtime.activeCharacter?.id && runtime.activeConversation
      ? runtime.activeConversation
      : characterStories[0];
    const events = story
      ? runtime.allStoryEvents.filter((event) => event.storyId === story.id
        && event.status === "committed"
        && (event.eventType === "phone_message_received" || event.eventType === "phone_message_sent"))
      : [];
    const lastEvent = events.at(-1);
    return {
      character,
      story,
      events,
      lastEvent,
      unread: events.filter((event) => event.eventType === "phone_message_received" && !event.readAt).length,
      sortTime: lastEvent?.storyTime ?? story?.updatedAt ?? character.updatedAt,
    };
  }).sort((left, right) => right.sortTime.localeCompare(left.sortTime)), [
    runtime.activeCharacter?.id,
    runtime.activeConversation,
    runtime.allConversations,
    runtime.allStoryEvents,
    runtime.characters,
  ]);
  const filteredPhoneThreads = useMemo(() => {
    const query = phoneContactQuery.trim().toLocaleLowerCase();
    if (!query) return phoneThreads;
    return phoneThreads.filter((thread) => [
      thread.character.name,
      thread.character.nickname,
      thread.story?.title ?? "",
      thread.lastEvent?.content ?? "",
    ].join(" ").toLocaleLowerCase().includes(query));
  }, [phoneContactQuery, phoneThreads]);
  const resolvedPhoneCharacterId = phoneCharacterId && runtime.characters.some((character) => character.id === phoneCharacterId)
    ? phoneCharacterId
    : runtime.activeCharacter?.id ?? runtime.characters[0]?.id ?? "";
  const activePhoneThread = phoneThreads.find((thread) => thread.character.id === resolvedPhoneCharacterId)
    ?? phoneThreads.find((thread) => thread.character.id === runtime.activeCharacter?.id)
    ?? phoneThreads[0];
  const phoneCharacter = activePhoneThread?.character ?? runtime.activeCharacter;
  const phoneMessages = activePhoneThread?.events ?? [];
  const phoneActiveName = phoneCharacter?.nickname || phoneCharacter?.name || "Lunemir";
  const phoneWidth = 350 * runtime.appearance.phoneScale / 100;
  const phoneHeight = 720 * runtime.appearance.phoneScale / 100;
  const effectivePhoneButtonPosition = phoneButtonPosition ?? runtime.appearance.phoneButtonPosition ?? null;
  const effectivePhonePanelPosition = phonePanelPosition ?? runtime.appearance.phonePanelPosition ?? null;
  const phoneShellStyle: CSSProperties = {
    width: `${phoneWidth}px`,
    minWidth: `${phoneWidth}px`,
    maxWidth: `${phoneWidth}px`,
    height: `${phoneHeight}px`,
    minHeight: `${phoneHeight}px`,
    maxHeight: `${phoneHeight}px`,
    ...(effectivePhonePanelPosition ? { left: effectivePhonePanelPosition.x, top: effectivePhonePanelPosition.y, right: "auto", bottom: "auto" } : {}),
  };
  const phoneWallpaperStyle = runtime.appearance.phoneWallpaper === "custom" && runtime.appearance.phoneWallpaperImage
    ? { backgroundImage: `url("${runtime.appearance.phoneWallpaperImage}")` }
    : undefined;

  useEffect(() => {
    if (!navigationOpen) return;
    function closeNavigation(event: KeyboardEvent) {
      if (event.key === "Escape") setNavigationOpen(false);
    }
    window.addEventListener("keydown", closeNavigation);
    return () => window.removeEventListener("keydown", closeNavigation);
  }, [navigationOpen]);

  function navigateTo(nextSection: Section) {
    setSection(nextSection);
    setNavigationOpen(false);
    if (nextSection !== "chat") setContextOpen(false);
  }

  useEffect(() => {
    if (section !== "chat" || !followOutputRef.current) return;
    const messageList = messageListRef.current;
    if (!messageList) return;
    messageList.scrollTo({ top: messageList.scrollHeight, behavior: runtime.streaming ? "auto" : "smooth" });
    setShowJumpToLatest(false);
  }, [runtime.messages.length, lastMessageContent, runtime.streaming, section]);

  function scrollToLatest() {
    followOutputRef.current = true;
    const messageList = messageListRef.current;
    if (!messageList) return;
    messageList.scrollTo({ top: messageList.scrollHeight, behavior: "smooth" });
    setShowJumpToLatest(false);
  }

  useEffect(() => {
    if (!phoneOpen || phoneApp !== "messages" || phoneMessageView !== "chat") return;
    const messageList = phoneMessageListRef.current;
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
  }, [phoneMessages.length, phoneOpen, phoneApp, phoneMessageView]);

  function openPhoneApp(app: Exclude<PhoneApp, "home">) {
    setPhoneApp(app);
    if (app === "messages") setPhoneMessageView("list");
  }

  async function openPhoneThread(characterId: string) {
    setPhoneCharacterId(characterId);
    const existing = phoneThreads.find((thread) => thread.character.id === characterId)?.story;
    const story = existing ?? await runtime.ensurePhoneStory(characterId);
    setPhoneMessageView("chat");
    if (story) await runtime.markPhoneEventsRead(story.id);
  }

  function openMainSectionFromPhone(nextSection: Section) {
    setPhoneOpen(false);
    navigateTo(nextSection);
  }

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
    phonePositionRef.current = {
      button: effectivePhoneButtonPosition,
      panel: effectivePhonePanelPosition,
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
    phonePositionRef.current[drag.target] = next;
  }

  function endPhoneDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = phoneDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressPhoneClickRef.current = drag.target === "button" && drag.moved;
    phoneDragRef.current = null;
    setDraggingPhone(null);
    void runtime.saveAppearance({
      ...runtime.appearance,
      phoneButtonPosition: phonePositionRef.current.button ?? runtime.appearance.phoneButtonPosition,
      phonePanelPosition: phonePositionRef.current.panel ?? runtime.appearance.phonePanelPosition,
    });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function closeImport() {
    setImportOpen(false);
    runtime.clearImport();
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
    <main
      className="lunemir-app"
      data-theme={runtime.appearance.theme}
      data-glass-mode={runtime.appearance.glassMode}
      data-glass-scope={runtime.appearance.glassScope}
      data-message-style={runtime.appearance.messageStyle}
      data-reading-style={runtime.appearance.readingStyle}
      data-avatar-shape={runtime.appearance.avatarShape}
      data-avatar-layout={runtime.appearance.avatarLayout}
      data-font-family={runtime.appearance.fontFamily}
      data-phone-wallpaper={runtime.appearance.phoneWallpaper}
      data-has-background={activeBackground ? "true" : "false"}
      data-section={section}
      style={appearanceStyle}
    >
      <div className={activeBackground ? "scene-background has-image" : "scene-background"} style={activeBackground ? { backgroundImage: `url("${activeBackground}")` } : undefined} />
      <div className="scene-overlay" />
      <div className="scene-glass" />
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <button
        className={navigationOpen ? "navigation-backdrop is-open" : "navigation-backdrop"}
        type="button"
        onClick={() => setNavigationOpen(false)}
        aria-label="关闭主菜单"
        tabIndex={navigationOpen ? 0 : -1}
      />
      <GlassPanel as="aside" className={navigationOpen ? "navigation-drawer is-open" : "navigation-drawer"} aria-label="Lunemir 主菜单" aria-hidden={!navigationOpen}>
        <div className="navigation-drawer-heading">
          <CharacterOrb avatarDataUrl={runtime.activeCharacter?.avatarDataUrl} name={activeName} />
          <div><span className="eyebrow">CURRENT STORY</span><strong>{activeName}</strong>{activeSignature ? <small>{activeSignature}</small> : null}</div>
          <button type="button" onClick={() => setNavigationOpen(false)} aria-label="关闭主菜单" tabIndex={navigationOpen ? 0 : -1}>×</button>
        </div>
        <nav className="navigation-drawer-list" aria-label="功能页面">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={section === item.id ? "is-active" : ""}
              onClick={() => navigateTo(item.id)}
              aria-current={section === item.id ? "page" : undefined}
              tabIndex={navigationOpen ? 0 : -1}
            >
              <span aria-hidden="true">{item.icon}</span>
              <div><strong>{item.label}</strong><small>{{ chat: "继续当前故事与角色互动", characters: "角色卡与开场白", lore: "世界书库与条目", presets: "提示词与输出美化", themes: "聊天背景与毛玻璃", settings: "模型、数据与连接" }[item.id]}</small></div>
              <i aria-hidden="true">›</i>
            </button>
          ))}
        </nav>
        <button
          className="navigation-persona"
          type="button"
          onClick={() => { setNavigationOpen(false); setPersonaOpen(true); }}
          tabIndex={navigationOpen ? 0 : -1}
        >
          <span style={runtime.activePersona?.avatarDataUrl ? { backgroundImage: `url(${runtime.activePersona.avatarDataUrl})` } : undefined}>{runtime.activePersona?.avatarDataUrl ? "" : (runtime.activePersona?.name ?? "Y").charAt(0).toUpperCase()}</span>
          <div><strong>{runtime.activePersona?.name ?? "旅行者"}</strong><small>当前用户人设 · 点击编辑或切换</small></div>
          <i aria-hidden="true">›</i>
        </button>
      </GlassPanel>

      <GlassPanel as="section" className="workspace">
        <header className="top-bar">
          <div className="top-title">
            <button className="navigation-trigger" type="button" onClick={() => setNavigationOpen(true)} aria-label="打开主菜单" aria-expanded={navigationOpen}>
              <i /><i /><i />
            </button>
            {section === "chat" ? <CharacterOrb small avatarDataUrl={runtime.activeCharacter?.avatarDataUrl} name={activeName} /> : <span className="section-glyph">{navItems.find((item) => item.id === section)?.icon}</span>}
            <div>
              <p>{section === "chat" ? activeSignature || "CURRENT STORY" : "LUNEMIR"}</p>
              <h1>{section === "chat" ? activeName : pageTitle}</h1>
            </div>
          </div>
          <div className="top-actions">
            <span className="secure-state"><i /> IndexedDB 已就绪</span>
            {section === "chat" && (
              <details className="chat-header-menu">
                <summary className="icon-button" aria-label="打开聊天菜单">•••</summary>
                <div>
                  <button type="button" onClick={() => setSessionOpen(true)}>会话、章节与记忆</button>
                  <button type="button" onClick={() => setStoryGuidanceOpen(true)}>作者注释与剧情摘要</button>
                  <button type="button" onClick={() => setStoryTimelineOpen(true)}>剧情时间与事件 <span>{runtime.storyEvents.filter((event) => event.status === "committed").length}</span></button>
                  {greetingOptions.length > 1 ? <button type="button" onClick={() => setGreetingPickerOpen(true)}>选择开场白 <span>{greetingOptions.length}</span></button> : null}
                  <button type="button" className="context-menu-action" onClick={() => setContextOpen(!contextOpen)}>上下文详情</button>
                </div>
              </details>
            )}
          </div>
        </header>

        {section === "chat" && (
          <section className="chat-stage" aria-label="主剧情阅读区">
            <section
              className="message-list"
              aria-label="主剧情消息"
              tabIndex={0}
              ref={messageListRef}
              onScroll={(event) => {
                const target = event.currentTarget;
                const nearLatest = target.scrollHeight - target.scrollTop - target.clientHeight < 140;
                followOutputRef.current = nearLatest;
                setShowJumpToLatest(!nearLatest);
              }}
            >
              <div className="message-log" role="log" aria-label="剧情消息" aria-live="polite" aria-relevant="additions text">
                {runtime.messages.length === 0 && <section className="empty-chat" aria-label="空故事"><span aria-hidden="true">◌</span><strong>故事还没有开始</strong><p>发送第一条消息，或为角色设置一条开场白。</p></section>}
                {runtime.messages.map((message, index) => {
                const isUser = message.role === "user";
                const speakerName = isUser ? runtime.activePersona?.name ?? "You" : activeName;
                const showAvatar = isUser ? runtime.appearance.showUserAvatar : runtime.appearance.showCharacterAvatar;
                const showName = isUser ? runtime.appearance.showUserName : runtime.appearance.showCharacterName;
                const avatar = isUser ? runtime.activePersona?.avatarDataUrl : runtime.activeCharacter?.avatarDataUrl;
                const displayContent = replaceRoleMacros(message.content, activeName, runtime.activePersona?.name ?? "用户");
                const previousMessage = runtime.messages[index - 1];
                const showDay = !previousMessage || messageDayLabel(previousMessage.createdAt) !== messageDayLabel(message.createdAt);
                return (
                  <Fragment key={message.id}>
                    {showDay ? <div className="date-divider" role="separator" aria-label={messageDayLabel(message.createdAt)}><time dateTime={message.createdAt}>{messageDayLabel(message.createdAt)}</time></div> : null}
                    {message.status === "streaming" && !message.content ? (
                      <div className="message-row character-row typing-row" role="status">
                        {runtime.appearance.showCharacterAvatar ? <MessageAvatar image={runtime.activeCharacter?.avatarDataUrl} name={activeName} side="character" /> : null}
                        <div className="typing-bubble" aria-label={`${activeName} 正在输入`}><i /><i /><i /></div>
                      </div>
                    ) : (
                      <div className={isUser ? "message-row user-row" : "message-row character-row"}>
                        {!isUser && showAvatar ? <MessageAvatar image={avatar} name={speakerName} side="character" /> : null}
                        <article className={isUser ? "message user-message" : "message character-message"} aria-label={`${speakerName}的消息`}>
                          <header className="message-meta">
                            {showName ? <strong>{speakerName}</strong> : null}
                            {runtime.appearance.showTimestamp ? <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time> : null}
                            {message.editedAt && <em>已编辑</em>}
                            {message.status === "stopped" && <em>已停止</em>}
                            {message.status === "error" && <em>失败</em>}
                            {message.continuationCount ? <em>已续写 {message.continuationCount} 次</em> : null}
                            {message.finishReason && ["length", "max_tokens", "max_output_tokens"].includes(message.finishReason) ? <em>仍达到输出上限</em> : null}
                          </header>
                          {!isUser && message.reasoning?.trim() ? <details className="message-reasoning"><summary><span>✦</span>{message.status === "streaming" ? "正在思考" : "查看思考过程"}</summary><pre>{replaceRoleMacros(message.reasoning, activeName, runtime.activePersona?.name ?? "用户")}</pre></details> : null}
                          {editingMessageId === message.id ? (
                            <div className="message-editor">
                              <textarea value={editingMessageText} onChange={(event) => setEditingMessageText(event.target.value)} rows={4} autoFocus />
                              <span><button onClick={() => setEditingMessageId("")}>取消</button><button onClick={() => void saveMessageEdit()}>保存</button></span>
                            </div>
                          ) : message.role === "assistant" && activeOutputRenderer?.enabled ? (
                            <SafeMessageContent source={displayContent} config={activeOutputRenderer} rawMode={rawMessageIds.has(message.id)} />
                          ) : runtime.appearance.messageStyle === "novel-flow" && !isUser ? (
                            <div className="novel-message-content">
                              {displayContent.trim().split(/\n\s*\n/).map((paragraph, paragraphIndex) => <p key={`${message.id}-paragraph-${paragraphIndex}`}>{paragraph.trim()}</p>)}
                            </div>
                          ) : <p>{displayContent}</p>}
                          {!runtime.streaming && editingMessageId !== message.id && (
                            <details className="message-tools">
                              <summary aria-label="打开消息操作">•••</summary>
                              <div className="message-actions">
                                {message.role === "assistant" && activeOutputRenderer?.enabled ? <button onClick={() => setRawMessageIds((current) => {
                                  const next = new Set(current);
                                  if (next.has(message.id)) next.delete(message.id);
                                  else next.add(message.id);
                                  return next;
                                })}>{rawMessageIds.has(message.id) ? "查看美化" : "查看原文"}</button> : null}
                                <button onClick={() => beginMessageEdit(message.id, message.content)}>编辑</button>
                                <button onClick={() => void runtime.branchConversation(message.id)}>从这里分支</button>
                                <button onClick={() => void runtime.addMemoryCandidate(message.id)} disabled={(runtime.activeConversation?.memories ?? []).some((memory) => memory.sourceMessageId === message.id)}>{(runtime.activeConversation?.memories ?? []).some((memory) => memory.sourceMessageId === message.id) ? "已加入记忆" : "记住"}</button>
                                <button className="danger-action" onClick={() => { if (window.confirm("删除这条消息？相关章节点与待确认记忆也会一并移除。")) void runtime.deleteMessage(message.id); }}>删除</button>
                                {message.role === "assistant" && index === runtime.messages.length - 1 && <><button onClick={() => void runtime.continueLastReply()}>继续生成</button><button onClick={() => void runtime.regenerateLastReply()}>重新生成</button></>}
                              </div>
                            </details>
                          )}
                          {(message.alternatives?.length ?? 0) > 1 && editingMessageId !== message.id && (
                            <div className="message-versions" aria-label="回复版本切换">
                              <button onClick={() => void runtime.selectMessageAlternative(message.id, Math.max(0, (message.activeAlternative ?? 0) - 1))} disabled={(message.activeAlternative ?? 0) === 0 || runtime.streaming} aria-label="上一个回复版本">‹</button>
                              <span>{(message.activeAlternative ?? 0) + 1} / {message.alternatives?.length}</span>
                              <button onClick={() => void runtime.selectMessageAlternative(message.id, Math.min((message.alternatives?.length ?? 1) - 1, (message.activeAlternative ?? 0) + 1))} disabled={(message.activeAlternative ?? 0) >= (message.alternatives?.length ?? 1) - 1 || runtime.streaming} aria-label="下一个回复版本">›</button>
                            </div>
                          )}
                        </article>
                        {isUser && showAvatar ? <MessageAvatar image={avatar} name={speakerName} side="user" /> : null}
                      </div>
                    )}
                  </Fragment>
                );
                })}
              </div>
            </section>

            {showJumpToLatest ? <button className="jump-to-latest" type="button" onClick={scrollToLatest}>回到最新消息 ↓</button> : null}

            <form className="composer" onSubmit={sendMessage} aria-label="发送剧情消息">
              <label className="composer-field">
                <span className="sr-only">输入消息</span>
                <textarea
                  name="message"
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    event.currentTarget.style.height = "auto";
                    event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 132)}px`;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="写下你想说的话…"
                  autoComplete="off"
                  enterKeyHint="send"
                  aria-describedby="composer-shortcut-hint"
                  rows={1}
                />
                <span id="composer-shortcut-hint">Enter 发送 · Shift + Enter 换行</span>
              </label>
              <button
                className={runtime.streaming ? "send-button is-stopping" : "send-button"}
                type={runtime.streaming ? "button" : "submit"}
                onClick={runtime.streaming ? runtime.stopGeneration : undefined}
                disabled={!runtime.streaming && !draft.trim()}
                aria-label={runtime.streaming ? "停止生成" : "发送消息"}
              >{runtime.streaming ? "■" : "↗"}</button>
            </form>
          </section>
        )}

        {section === "characters" && (
          <div className="content-view">
            <div className="view-heading">
              <div><span className="eyebrow">CHARACTER LIBRARY</span><h2>与你产生联系的人</h2><p className="view-description">选择角色即可进入其独立剧情；编辑、复制、导出和删除收在卡片的更多菜单中。</p></div>
              <div className="view-heading-actions"><button onClick={() => setImportOpen(true)}>导入角色卡</button><button className="primary-button" onClick={() => setCharacterEditor({ mode: "create" })}>新建角色</button></div>
            </div>
            <div className="library-toolbar"><LibrarySearch label="搜索角色、标签或剧情" value={characterQuery} count={filteredCharacters.length} onChange={setCharacterQuery} /></div>
            <div className="character-grid">
              {filteredCharacters.map((character, index) => (
                <article className="character-card-shell" key={character.id}>
                  <button className={`character-card ${["violet", "cyan", "rose"][index % 3]} ${runtime.activeCharacter?.id === character.id ? "is-active" : ""}`} onClick={() => { void runtime.selectCharacter(character); setSection("chat"); }}>
                    <span className="card-orb" style={character.avatarDataUrl ? { backgroundImage: `url(${character.avatarDataUrl})` } : undefined}>{character.avatarDataUrl ? "" : character.name.charAt(0)}</span>
                    <span className="character-card-copy"><strong>{character.name}</strong><p>{character.scenario || character.description || "暂未填写角色设定"}</p><small>{character.tags.slice(0, 3).join(" · ") || character.creator || character.sourceFormat}</small></span>
                    <em>{runtime.activeCharacter?.id === character.id ? "正在对话" : `${character.spec.toUpperCase()} · 本地保存`}</em>
                  </button>
                  <LibraryActionMenu label={`管理 ${character.name}`} actions={[
                    { label: "编辑角色", onSelect: () => setCharacterEditor({ mode: "edit", id: character.id }) },
                    { label: "复制角色", onSelect: async () => { const duplicate = await runtime.duplicateCharacter(character.id); if (duplicate) setCharacterEditor({ mode: "edit", id: duplicate.id }); } },
                    { label: "导出 V2 JSON", onSelect: () => runtime.downloadCharacter(character.id) },
                    { label: "删除角色", danger: true, onSelect: async () => { if (window.confirm(`删除角色“${character.name}”及其全部会话、手机事件和记忆？此操作无法撤销。`)) await runtime.deleteCharacterProfile(character.id); } },
                  ]} />
                </article>
              ))}
              {filteredCharacters.length === 0 ? <div className="empty-state library-empty"><span>⌕</span><strong>没有找到角色</strong><p>换一个名称、标签或剧情关键词试试。</p></div> : null}
            </div>
          </div>
        )}

        {section === "lore" && (
          <div className="content-view">
            <div className="view-heading">
              <div><span className="eyebrow">WORLD INFO LIBRARY</span><h2>世界书库</h2><p className="view-description">所有角色卡内嵌世界书与独立世界书都集中在这里。为当前角色启用的独立世界书才会进入上下文。</p></div>
              <div className="view-heading-actions"><button onClick={() => setImportOpen(true)}>导入 JSON</button><button className="primary-button" onClick={() => setLorebookEditor({ mode: "create" })}>新建世界书</button></div>
            </div>
            <div className="library-toolbar"><LibrarySearch label="搜索世界书、条目或关键词" value={loreQuery} count={filteredEmbeddedLorebooks.length + filteredLorebooks.length} onChange={setLoreQuery} /></div>
            <div className="lore-list">
              {filteredEmbeddedLorebooks.length > 0 ? <span className="lore-section-label">角色卡内嵌 · 随对应角色自动使用</span> : null}
              {filteredEmbeddedLorebooks.map((character, index) => (
                <article className={runtime.activeCharacter?.id === character.id ? "lore-row embedded is-enabled" : "lore-row embedded"} key={character.id}>
                  <span className="lore-color" style={{ background: ["#a990ff", "#69dcff", "#ff90c7"][index % 3] }} />
                  <button className="lore-open" onClick={() => setLorebookEditor({ mode: "embedded", characterId: character.id })}>
                    <strong>{character.lorebookName || `${character.name} · 内嵌世界书`}</strong>
                    <small>{character.name} · {character.lorebookEntries.filter((entry) => entry.enabled).length}/{character.lorebookEntries.length} 个条目启用</small>
                  </button>
                  <span className="lore-binding-state">{runtime.activeCharacter?.id === character.id ? "当前角色使用中" : "随角色切换"}</span>
                  <LibraryActionMenu label={`管理 ${character.lorebookName || `${character.name} 内嵌世界书`}`} actions={[
                    { label: "编辑条目", onSelect: () => setLorebookEditor({ mode: "embedded", characterId: character.id }) },
                  ]} />
                </article>
              ))}
              {filteredLorebooks.length > 0 ? <span className="lore-section-label">独立世界书 · 为当前角色 {activeName} 单独启停</span> : null}
              {filteredLorebooks.map((book, index) => {
                const enabled = runtime.activeLorebooks.some((item) => item.id === book.id);
                const assignedCharacters = runtime.characters.filter((character) => (runtime.lorebookAssignments[character.id] ?? []).includes(book.id));
                return (
                  <article className={enabled ? "lore-row standalone is-enabled" : "lore-row standalone"} key={book.id}>
                    <span className="lore-color" style={{ background: ["#69dcff", "#a990ff", "#ff90c7"][index % 3] }} />
                    <button className="lore-open" onClick={() => setLorebookEditor({ mode: "edit", id: book.id })}><strong>{book.name}</strong><small>{book.entries.filter((entry) => entry.enabled).length}/{book.entries.length} 个条目启用 · 已绑定 {assignedCharacters.length} 个角色</small></button>
                    <span className="lore-binding-state">{assignedCharacters.map((character) => character.name).join("、") || "尚未绑定角色"}</span>
                    <div className="lore-actions">
                      <button className="lore-toggle" onClick={() => void runtime.toggleLorebookAssignment(book.id)}>{enabled ? `${activeName} 已启用` : `为 ${activeName} 启用`}</button>
                      <LibraryActionMenu label={`管理 ${book.name}`} actions={[
                        { label: "编辑世界书", onSelect: () => setLorebookEditor({ mode: "edit", id: book.id }) },
                        { label: "复制世界书", onSelect: async () => { const duplicate = await runtime.duplicateLorebook(book.id); if (duplicate) setLorebookEditor({ mode: "edit", id: duplicate.id }); } },
                        { label: "导出 JSON", onSelect: () => runtime.downloadLorebook(book.id) },
                        { label: "删除世界书", danger: true, onSelect: async () => { if (window.confirm(`删除世界书“${book.name}”？它会同时从所有角色的启用列表中移除。`)) await runtime.deleteLorebookProfile(book.id); } },
                      ]} />
                    </div>
                  </article>
                );
              })}
              {filteredEmbeddedLorebooks.length === 0 && filteredLorebooks.length === 0 ? <div className="empty-state library-empty"><span>{loreQuery ? "⌕" : "⌑"}</span><strong>{loreQuery ? "没有匹配的世界书" : "还没有世界书"}</strong><p>{loreQuery ? "换一个世界书名称、条目或关键词试试。" : "导入 World Info JSON 后会进入世界书库，并默认为当前角色启用。"}</p></div> : null}
            </div>
          </div>
        )}

        {section === "presets" && (
          <div className="content-view">
            <div className="view-heading">
              <div><span className="eyebrow">PROMPT PRESET LIBRARY</span><h2>提示词预设</h2><p className="view-description">预设控制写作方式、角色行为、叙事规则和生成参数。当前只启用一个预设，不会覆盖库中的其他预设。</p></div>
              <div className="view-heading-actions"><button onClick={() => setImportOpen(true)}>导入 JSON</button><button className="primary-button" onClick={() => setPresetEditor({ mode: "create" })}>新建预设</button></div>
            </div>
            <div className="library-toolbar"><LibrarySearch label="搜索预设或提示词模块" value={presetQuery} count={filteredPresets.length} onChange={setPresetQuery} /></div>
            <span className="library-section-label">当前预设</span>
            <div className="preset-library-grid">
              {runtime.activePreset ? (() => {
                const preset = runtime.activePreset;
                const enabledModules = Array.isArray(preset.modules) ? preset.modules.filter((module) => module.enabled).length : [preset.systemPrompt, preset.postHistoryInstructions].filter(Boolean).length;
                const totalModules = Array.isArray(preset.modules) ? preset.modules.length : enabledModules;
                return (
                  <article className="preset-library-card preset-current-card is-active" key={preset.id}>
                    <span className="preset-library-glyph">≋</span>
                    <button className="preset-library-open" onClick={() => setPresetEditor({ mode: "edit", id: preset.id })}><strong>{preset.name}</strong><p>{enabledModules}/{totalModules} 个模块启用 · {preset.sourceName}</p><small>当前正在影响生成</small></button>
                    <div className="preset-card-controls"><button className="is-applied" disabled>已启用</button><LibraryActionMenu label={`管理 ${preset.name}`} actions={[
                      { label: "编辑预设", onSelect: () => setPresetEditor({ mode: "edit", id: preset.id }) },
                      { label: "复制预设", onSelect: async () => { const duplicate = await runtime.duplicatePreset(preset.id); if (duplicate) setPresetEditor({ mode: "edit", id: duplicate.id }); } },
                      { label: "导出 JSON", onSelect: () => runtime.downloadPreset(preset.id) },
                      { label: "停用预设", onSelect: () => runtime.activatePreset("") },
                      { label: "删除预设", danger: true, onSelect: async () => { if (window.confirm(`删除预设“${preset.name}”？此操作不会删除角色或聊天记录。`)) await runtime.deletePresetProfile(preset.id); } },
                    ]} /></div>
                  </article>
                );
              })() : (
                <article className="preset-library-card preset-current-card is-active">
                  <span className="preset-library-glyph">○</span>
                  <div><strong>基础上下文</strong><p>只使用角色卡、人设、世界书和当前对话。</p><small>当前未启用额外预设</small></div>
                  <button className="is-applied" disabled>已启用</button>
                </article>
              )}
            </div>
            {filteredPresets.some((preset) => preset.id !== activePresetId) ? <span className="library-section-label">其他预设</span> : null}
            <div className="preset-library-grid">
              {filteredPresets.filter((preset) => preset.id !== activePresetId).map((preset) => {
                const enabledModules = Array.isArray(preset.modules) ? preset.modules.filter((module) => module.enabled).length : [preset.systemPrompt, preset.postHistoryInstructions].filter(Boolean).length;
                const totalModules = Array.isArray(preset.modules) ? preset.modules.length : enabledModules;
                return (
                  <article className="preset-library-card" key={preset.id}>
                    <span className="preset-library-glyph">≋</span>
                    <button className="preset-library-open" onClick={() => setPresetEditor({ mode: "edit", id: preset.id })}><strong>{preset.name}</strong><p>{enabledModules}/{totalModules} 个模块启用 · {preset.sourceName}</p><small>{Object.keys(preset.modelPatch).length ? `${Object.keys(preset.modelPatch).length} 个模型参数` : "仅提示词规则"}</small></button>
                    <div className="preset-card-controls"><button onClick={() => void runtime.activatePreset(preset.id)}>使用</button><LibraryActionMenu label={`管理 ${preset.name}`} actions={[
                      { label: "编辑预设", onSelect: () => setPresetEditor({ mode: "edit", id: preset.id }) },
                      { label: "复制预设", onSelect: async () => { const duplicate = await runtime.duplicatePreset(preset.id); if (duplicate) setPresetEditor({ mode: "edit", id: duplicate.id }); } },
                      { label: "导出 JSON", onSelect: () => runtime.downloadPreset(preset.id) },
                      { label: "删除预设", danger: true, onSelect: async () => { if (window.confirm(`删除预设“${preset.name}”？此操作不会删除角色或聊天记录。`)) await runtime.deletePresetProfile(preset.id); } },
                    ]} /></div>
                  </article>
                );
              })}
              {runtime.presets.length === 0 ? <div className="empty-state library-empty"><span>≋</span><strong>还没有提示词预设</strong><p>导入常见聊天预设 JSON，或从空白模块开始创建。</p></div> : null}
              {runtime.presets.length > 0 && filteredPresets.length === 0 ? <div className="empty-state library-empty"><span>⌕</span><strong>没有匹配的预设</strong><p>换一个预设名称或提示词内容试试。</p></div> : null}
            </div>
          </div>
        )}

        {section === "themes" && (
          <div className="content-view appearance-view">
            <ChatAppearancePanel
              value={runtime.appearance}
              onPreview={runtime.previewAppearance}
              onSave={(next) => void runtime.saveAppearance(next)}
              onUploadBackground={(file) => void runtime.saveCustomBackground(file)}
            />
          </div>
        )}

        {section === "settings" && (
          <div className="content-view settings-view">
            <div className="view-heading"><div><span className="eyebrow">MODEL CONNECTION</span><h2>模型与生图接口</h2><p className="view-description">可保存并切换多个站点配置；每个预设的 API Key 仅保存在当前浏览器，不进入备份或 GitHub。</p></div><span className={`status-pill ${runtime.connectionStatus}`}>{({ idle: "语言接口未测试", testing: "语言接口测试中", connected: "语言接口已连接", error: "语言接口失败" })[runtime.connectionStatus]}</span></div>
            <div className="settings-card settings-card-grouped">
              <section className="settings-group">
                <header><span>01</span><div><strong>语言模型接口预设</strong><small>为不同中转站、本地模型或官方接口分别保存地址、模型与参数。</small></div></header>
                <div className="provider-profile-toolbar">
                  <div role="tablist" aria-label="语言模型接口预设">
                    {runtime.modelProfiles.map((profile) => <button type="button" role="tab" aria-selected={profile.id === runtime.activeModelProfileId} className={profile.id === runtime.activeModelProfileId ? "is-active" : ""} key={profile.id} onClick={() => void runtime.selectModelProfile(profile.id)}><strong>{profile.name}</strong><small>{profile.config.model || "未选模型"}</small></button>)}
                  </div>
                  <button type="button" className="provider-profile-add" onClick={() => void runtime.createModelProfile()}>＋ 新增站点</button>
                </div>
                <div className="provider-profile-editor">
                  <label>预设名称<input value={runtime.modelProfiles.find((profile) => profile.id === runtime.activeModelProfileId)?.name ?? ""} onChange={(event) => runtime.renameModelProfile(event.target.value)} maxLength={60} placeholder="例如：OpenRouter / 本地 LM Studio" /></label>
                  <button type="button" onClick={() => void runtime.deleteModelProfile()} disabled={runtime.modelProfiles.length <= 1}>删除当前预设</button>
                </div>
                <div className="settings-field-grid">
                  <label>API 地址<input type="url" value={runtime.modelConfig.baseUrl} onChange={(event) => runtime.setModelConfig({ ...runtime.modelConfig, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" /></label>
                  <label>API Key <small>保存到当前浏览器，不进入导出备份</small><input type="password" value={runtime.apiKey} onChange={(event) => runtime.setApiKey(event.target.value)} placeholder="sk-… 或本地服务可留空" autoComplete="off" /></label>
                  <label>模型选择 <small>{runtime.availableModels.length > 0 ? `已拉取 ${runtime.availableModels.length} 个模型` : "点击右侧按钮从接口读取"}</small><span className="provider-model-picker"><select value={runtime.modelConfig.model} onChange={(event) => runtime.setModelConfig({ ...runtime.modelConfig, model: event.target.value })} disabled={runtime.availableModels.length === 0}><option value="">{runtime.availableModels.length > 0 ? "请选择模型" : "尚未拉取模型"}</option>{runtime.modelConfig.model && !runtime.availableModels.includes(runtime.modelConfig.model) ? <option value={runtime.modelConfig.model}>{runtime.modelConfig.model}（当前手动值）</option> : null}{runtime.availableModels.map((model) => <option key={model} value={model}>{model}</option>)}</select><button type="button" onClick={() => void runtime.testConnection()} disabled={runtime.connectionStatus === "testing"}>{runtime.connectionStatus === "testing" ? "拉取中…" : "拉取模型"}</button></span></label>
                  <label>手动模型 ID <small>接口没有模型列表时可直接填写</small><input value={runtime.modelConfig.model} onChange={(event) => runtime.setModelConfig({ ...runtime.modelConfig, model: event.target.value })} placeholder="model-name" /></label>
                </div>
                <details className="provider-endpoints"><summary>自定义兼容端点</summary><div className="settings-field-grid"><label>模型列表端点<input value={runtime.modelConfig.modelsPath} onChange={(event) => runtime.setModelConfig({ ...runtime.modelConfig, modelsPath: event.target.value })} placeholder="/models 或完整 URL" /></label><label>聊天补全端点<input value={runtime.modelConfig.chatCompletionsPath} onChange={(event) => runtime.setModelConfig({ ...runtime.modelConfig, chatCompletionsPath: event.target.value })} placeholder="/chat/completions 或完整 URL" /></label></div></details>
              </section>
              <section className="settings-group">
                <header><span>02</span><div><strong>生成参数</strong><small>预设可以临时覆盖这些值，原始配置仍会保留。</small></div></header>
                <div className="settings-field-grid three">
                  <label>温度<input type="number" min="0" max="2" step="0.1" value={runtime.modelConfig.temperature} onChange={(event) => runtime.setModelConfig({ ...runtime.modelConfig, temperature: Number(event.target.value) })} /><small>数值越高，回复越发散。</small></label>
                  <label>最大输出 Tokens<input type="number" min="1" step="1" value={runtime.modelConfig.maxTokens} onChange={(event) => runtime.setModelConfig({ ...runtime.modelConfig, maxTokens: Number(event.target.value) })} /><small>按当前模型允许的上限填写。</small></label>
                  <label>上下文窗口<input type="number" min="1024" step="1" value={runtime.modelConfig.contextLimit} onChange={(event) => runtime.setModelConfig({ ...runtime.modelConfig, contextLimit: Number(event.target.value) })} /><small>例如 65535 或 128000。</small></label>
                </div>
              </section>
              <div className="settings-actions"><p><strong>语言接口</strong>：模型列表支持常见的 data、models、items 和数组返回结构；浏览器直连仍需要服务端允许 CORS。</p><div><button className="primary-button" onClick={() => void runtime.saveModel()}>保存语言预设</button></div></div>
              <section className="settings-group image-provider-group">
                <header><span>03</span><div><strong>生图 API 预设</strong><small>支持 OpenAI-compatible 的 images/generations，并兼容 URL 或 Base64 图片结果。</small></div><em className={`settings-group-status ${runtime.imageConnectionStatus}`}>{({ idle: "未测试", testing: "测试中", connected: "已连接", error: "连接失败" })[runtime.imageConnectionStatus]}</em></header>
                <div className="provider-profile-toolbar">
                  <div role="tablist" aria-label="生图接口预设">
                    {runtime.imageModelProfiles.map((profile) => <button type="button" role="tab" aria-selected={profile.id === runtime.activeImageModelProfileId} className={profile.id === runtime.activeImageModelProfileId ? "is-active" : ""} key={profile.id} onClick={() => void runtime.selectImageModelProfile(profile.id)}><strong>{profile.name}</strong><small>{profile.config.model || "未选模型"}</small></button>)}
                  </div>
                  <button type="button" className="provider-profile-add" onClick={() => void runtime.createImageModelProfile()}>＋ 新增生图站点</button>
                </div>
                <div className="provider-profile-editor">
                  <label>预设名称<input value={runtime.imageModelProfiles.find((profile) => profile.id === runtime.activeImageModelProfileId)?.name ?? ""} onChange={(event) => runtime.renameImageModelProfile(event.target.value)} maxLength={60} placeholder="例如：OpenAI Images / SiliconFlow" /></label>
                  <button type="button" onClick={() => void runtime.deleteImageModelProfile()} disabled={runtime.imageModelProfiles.length <= 1}>删除当前预设</button>
                </div>
                <div className="settings-field-grid">
                  <label>生图 API 地址<input type="url" value={runtime.imageModelConfig.baseUrl} onChange={(event) => runtime.setImageModelConfig({ ...runtime.imageModelConfig, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" /></label>
                  <label>生图 API Key <small>按预设保存到当前浏览器，不进入导出备份</small><input type="password" value={runtime.imageApiKey} onChange={(event) => runtime.setImageApiKey(event.target.value)} placeholder="可与语言接口不同" autoComplete="off" /></label>
                  <label>生图模型选择 <small>{runtime.availableImageModels.length > 0 ? `已拉取 ${runtime.availableImageModels.length} 个模型` : "点击右侧按钮从接口读取"}</small><span className="provider-model-picker"><select value={runtime.imageModelConfig.model} onChange={(event) => runtime.setImageModelConfig({ ...runtime.imageModelConfig, model: event.target.value })} disabled={runtime.availableImageModels.length === 0}><option value="">{runtime.availableImageModels.length > 0 ? "请选择生图模型" : "尚未拉取模型"}</option>{runtime.imageModelConfig.model && !runtime.availableImageModels.includes(runtime.imageModelConfig.model) ? <option value={runtime.imageModelConfig.model}>{runtime.imageModelConfig.model}（当前手动值）</option> : null}{runtime.availableImageModels.map((model) => <option key={model} value={model}>{model}</option>)}</select><button type="button" onClick={() => void runtime.testImageConnection()} disabled={runtime.imageConnectionStatus === "testing"}>{runtime.imageConnectionStatus === "testing" ? "拉取中…" : "拉取模型"}</button></span></label>
                  <label>手动生图模型 ID <small>接口没有模型列表时可直接填写</small><input value={runtime.imageModelConfig.model} onChange={(event) => runtime.setImageModelConfig({ ...runtime.imageModelConfig, model: event.target.value })} placeholder="gpt-image-1 / flux…" /></label>
                  <label>图片尺寸<input value={runtime.imageModelConfig.size} onChange={(event) => runtime.setImageModelConfig({ ...runtime.imageModelConfig, size: event.target.value })} placeholder="1024x1024" /></label>
                  <label>质量<input value={runtime.imageModelConfig.quality} onChange={(event) => runtime.setImageModelConfig({ ...runtime.imageModelConfig, quality: event.target.value })} placeholder="standard / hd / high" /></label>
                  <label>风格<input value={runtime.imageModelConfig.style} onChange={(event) => runtime.setImageModelConfig({ ...runtime.imageModelConfig, style: event.target.value })} placeholder="可留空" /></label>
                </div>
                <details className="provider-endpoints"><summary>自定义生图端点</summary><div className="settings-field-grid"><label>模型列表端点<input value={runtime.imageModelConfig.modelsPath} onChange={(event) => runtime.setImageModelConfig({ ...runtime.imageModelConfig, modelsPath: event.target.value })} placeholder="/models 或完整 URL" /></label><label>图片生成端点<input value={runtime.imageModelConfig.generationsPath} onChange={(event) => runtime.setImageModelConfig({ ...runtime.imageModelConfig, generationsPath: event.target.value })} placeholder="/images/generations 或完整 URL" /></label></div></details>
                <div className="provider-inline-actions"><p>“拉取模型”只读取列表，不会消耗生图额度；真正生成请在手机“创作”中操作。</p><div><button type="button" className="primary-button" onClick={() => void runtime.saveImageModel()}>保存生图预设</button></div></div>
              </section>
            </div>
            <div className="data-card">
              <div><span className="eyebrow">LOCAL DATA</span><h3>本地数据与备份</h3><p>角色、聊天、人设、世界书和设置保存在当前浏览器。换设备前导出备份，或从 GitHub 获取代码后再恢复数据。</p></div>
              <div><button onClick={() => void runtime.downloadBackup()}>导出备份</button><label className="restore-button">恢复备份<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file && window.confirm("恢复备份会替换当前浏览器中的 Lunemir 数据，是否继续？")) void runtime.restoreFromBackup(file); event.currentTarget.value = ""; }} /></label></div>
            </div>
          </div>
        )}
      </GlassPanel>

      {section === "chat" && <GlassPanel as="aside" className={contextOpen ? "context-panel is-open" : "context-panel"}>
        <div className="context-heading"><div><span className="eyebrow">CONTEXT</span><h2>真实上下文预估</h2></div><button onClick={() => setContextOpen(false)} aria-label="关闭上下文">×</button></div>
        <div className="token-ring" style={{ background: `conic-gradient(var(--accent) 0 ${tokenUsage}%, rgba(255,255,255,.06) ${tokenUsage}% 100%)` }}><span><strong>{runtime.contextReport?.estimatedTokens.toLocaleString() ?? 0}</strong><small>/ {runtime.contextReport?.limit.toLocaleString() ?? 0} tokens</small></span></div>
        <button className="context-inspector-open" type="button" onClick={() => setContextInspectorOpen(true)} disabled={!runtime.contextReport}><span><strong>检查本轮提示词</strong><small>查看模型实际收到的完整顺序</small></span><i aria-hidden="true">›</i></button>
        <div className="context-block">
          <div className="block-title"><span>当前人设</span></div>
          <article className="persona-card"><span style={runtime.activePersona?.avatarDataUrl ? { backgroundImage: `url(${runtime.activePersona.avatarDataUrl})` } : undefined}>{runtime.activePersona?.avatarDataUrl ? "" : (runtime.activePersona?.name ?? "Y").charAt(0)}</span><div><strong>{runtime.activePersona?.name ?? "旅行者"}</strong><small>正在与 {activeName} 对话</small></div></article>
        </div>
        <div className="context-block">
          <div className="block-title"><span>世界书命中</span><em>{runtime.contextReport ? `${runtime.contextReport.loreStats.matched}/${runtime.contextReport.loreStats.enabled}` : "0/0"}</em></div>
          {(runtime.contextReport?.matchedLore ?? []).map((match, index) => <article className="context-item" key={match.entry.id}><i className={["cyan", "violet", "rose"][index % 3]} /><span><strong>{match.entry.name}</strong><small>{match.reason}</small></span><b>P{match.entry.priority}</b></article>)}
          {(runtime.contextReport?.matchedLore.length ?? 0) === 0 && <p className="context-empty">已扫描 {runtime.contextReport?.loreStats.total ?? 0} 个条目，当前对话没有触发内容。</p>}
        </div>
        <div className="context-block memory-block">
          <div className="block-title"><span>上下文组成</span><em>实时</em></div>
          {(runtime.contextReport?.segments ?? []).map((segment) => <div className="context-segment" key={segment.id}><span><strong>{segment.label}</strong><small>{segment.detail}</small></span><b>{segment.estimatedTokens} t</b></div>)}
          {(runtime.contextReport?.warnings ?? []).map((warning) => <p className="context-warning" key={warning}>{warning}</p>)}
        </div>
        <div className="context-footer"><span>上下文余量</span><strong>{(runtime.contextReport?.health ?? 100) > 25 ? "良好" : "注意"} · {runtime.contextReport?.health ?? 100}%</strong><div><i style={{ width: `${runtime.contextReport?.health ?? 100}%` }} /></div></div>
      </GlassPanel>}

      {runtime.runtimeError && <div className="runtime-toast" role="alert"><span>!</span><p>{runtime.runtimeError}</p><button onClick={runtime.clearRuntimeError} aria-label="关闭错误提示">×</button></div>}

      <button
        className={`${phoneOpen ? "phone-fab is-active" : "phone-fab"}${draggingPhone === "button" ? " is-dragging" : ""}`}
        style={effectivePhoneButtonPosition ? { left: effectivePhoneButtonPosition.x, top: effectivePhoneButtonPosition.y, right: "auto", bottom: "auto" } : undefined}
        onPointerDown={(event) => beginPhoneDrag(event, "button")}
        onPointerMove={movePhoneDrag}
        onPointerUp={endPhoneDrag}
        onPointerCancel={endPhoneDrag}
        onClick={() => {
          if (suppressPhoneClickRef.current) { suppressPhoneClickRef.current = false; return; }
          const nextOpen = !phoneOpen;
          setPhoneOpen(nextOpen);
        }}
        aria-label="打开或拖动悬浮小手机"
      >
        <span className="phone-outline"><i /></span>{runtime.unreadPhoneEvents > 0 && <b>{runtime.unreadPhoneEvents}</b>}
      </button>

      <section
        className={`${phoneOpen ? "phone-shell is-open" : "phone-shell"}${draggingPhone === "panel" ? " is-dragging" : ""}`}
        style={phoneShellStyle}
        aria-label="Lunemir 悬浮小手机"
        aria-hidden={!phoneOpen}
      >
        <div className={`phone-frame phone-screen-${phoneApp}`}>
          <div className="phone-wallpaper" style={phoneWallpaperStyle} />
          <div className="phone-status" onPointerDown={(event) => beginPhoneDrag(event, "panel")} onPointerMove={movePhoneDrag} onPointerUp={endPhoneDrag} onPointerCancel={endPhoneDrag} title="拖动手机">
            <span>{new Date(runtime.storyState?.currentTime ?? runtime.activeConversation?.createdAt ?? 0).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
            <i className="phone-island" />
            <span className="phone-signals">▮▮▮ ◉ 87</span>
          </div>
          <button className="phone-close" type="button" onClick={() => setPhoneOpen(false)} aria-label="关闭手机">×</button>

          {phoneApp === "home" ? <div className="phone-desktop">
            <header className="phone-home-hero">
              <em>Lunemir Phone</em>
              <small>{new Date(phoneStoryTime).toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}</small>
              <strong>{new Date(phoneStoryTime).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</strong>
              <span>{runtime.storyState?.weather || "Lunemir 世界线"} · {runtime.storyState?.location || "地点未设定"}</span>
            </header>
            <div className="phone-app-grid">
              {phoneApps.map((app) => <button type="button" key={app.id} onClick={() => openPhoneApp(app.id)}>
                <i className={`phone-app-icon ${app.tone}`}>{app.icon}</i>
                <span>{app.label}</span>
                {app.id === "messages" && runtime.unreadPhoneEvents > 0 ? <b>{runtime.unreadPhoneEvents}</b> : null}
              </button>)}
            </div>
            <div className="phone-dock">
              {phoneApps.filter((app) => ["messages", "story", "studio", "settings"].includes(app.id)).map((app) => <button type="button" key={app.id} onClick={() => openPhoneApp(app.id)} aria-label={app.label}><i className={`phone-app-icon ${app.tone}`}>{app.icon}</i>{app.id === "messages" && runtime.unreadPhoneEvents > 0 ? <b>{runtime.unreadPhoneEvents}</b> : null}</button>)}
            </div>
          </div> : <div className="phone-app-view">
            <header className="phone-app-header">
              <button type="button" onClick={() => { if (phoneApp === "messages" && phoneMessageView === "chat") setPhoneMessageView("list"); else setPhoneApp("home"); }} aria-label="返回">‹</button>
              <strong>{phoneApp === "messages" && phoneMessageView === "chat" ? phoneActiveName : phoneApps.find((app) => app.id === phoneApp)?.label}</strong>
              {phoneApp === "messages" && phoneMessageView === "list" ? <button type="button" disabled={runtime.phoneEventStatus === "checking"} onClick={() => void runtime.requestPhoneEvent()} aria-label="检查新消息">{runtime.phoneEventStatus === "checking" ? "…" : "+"}</button> : <span />}
            </header>
            <div className="phone-content">
              {phoneApp === "messages" && phoneMessageView === "list" ? <div className="phone-conversation-list">
                <label className="phone-search"><span>⌕</span><input value={phoneContactQuery} onChange={(event) => setPhoneContactQuery(event.target.value)} placeholder="搜索联系人或消息" aria-label="搜索联系人或消息" /></label>
                {filteredPhoneThreads.map((thread) => {
                  const name = thread.character.nickname || thread.character.name;
                  return <button className="phone-conversation" type="button" key={thread.character.id} onClick={() => void openPhoneThread(thread.character.id)}>
                    <span className="phone-avatar" style={thread.character.avatarDataUrl ? { backgroundImage: `url(${thread.character.avatarDataUrl})` } : undefined}>{thread.character.avatarDataUrl ? "" : name.charAt(0)}</span>
                    <span><strong>{name}</strong><small>{thread.lastEvent?.content || thread.story?.title || "点击开始手机通信"}</small></span>
                    <time>{thread.lastEvent ? new Date(thread.lastEvent.storyTime).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : ""}</time>
                    {thread.unread > 0 ? <b>{thread.unread}</b> : null}
                  </button>;
                })}
                {filteredPhoneThreads.length === 0 ? <p className="phone-caption">没有找到匹配的联系人或消息。</p> : null}
                <p className="phone-system-note">主剧情和手机共用同一条时间线。这里的回复会作为正式事件进入下一轮剧情。</p>
              </div> : null}

              {phoneApp === "messages" && phoneMessageView === "chat" ? <div className="phone-chat">
                <div className="phone-message-list" ref={phoneMessageListRef}>
                  {phoneMessages.map((event) => {
                    const incoming = event.eventType === "phone_message_received";
                    return <article className={incoming ? "phone-message incoming" : "phone-message outgoing"} key={event.id}>
                      {incoming ? <span className="phone-bubble-avatar" style={phoneCharacter?.avatarDataUrl ? { backgroundImage: `url(${phoneCharacter.avatarDataUrl})` } : undefined}>{phoneCharacter?.avatarDataUrl ? "" : phoneActiveName.charAt(0)}</span> : null}
                      <span className="phone-message-bubble">{event.content}</span>
                      <time>{new Date(event.storyTime).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}{incoming && event.readAt ? " · 已读" : ""}</time>
                    </article>;
                  })}
                  {phoneMessages.length === 0 ? <p className="phone-caption">还没有与 {phoneActiveName} 的手机通信。你可以先发送一条消息；对应剧情下次生成时会读取它。</p> : null}
                </div>
                <form className="phone-composer" onSubmit={(event) => { event.preventDefault(); const content = phoneDraft.trim(); if (!content || !phoneCharacter) return; setPhoneDraft(""); void (async () => { const story = activePhoneThread?.story ?? await runtime.ensurePhoneStory(phoneCharacter.id); await runtime.sendPhoneMessageToStory(phoneCharacter.id, story?.id, content); })(); }}>
                  <button type="button" aria-label="语音功能待接入">◉</button>
                  <input value={phoneDraft} onChange={(event) => setPhoneDraft(event.target.value)} placeholder="发送消息" aria-label={`回复 ${phoneActiveName}`} maxLength={600} />
                  <button className="phone-send" type="submit" disabled={!phoneDraft.trim()}>发送</button>
                </form>
              </div> : null}

              {phoneApp === "contacts" ? <div className="phone-contact-page">
                <label className="phone-search contact-search"><span>⌕</span><input value={phoneContactQuery} onChange={(event) => setPhoneContactQuery(event.target.value)} placeholder="搜索联系人" aria-label="搜索联系人" /></label>
                <h4>剧情联系人 · {filteredPhoneThreads.length}</h4>
                <div className="phone-contact-list">{filteredPhoneThreads.map((thread) => {
                  const name = thread.character.nickname || thread.character.name;
                  return <button className="phone-contact-card" type="button" key={thread.character.id} onClick={() => { setPhoneApp("messages"); void openPhoneThread(thread.character.id); }}>
                    <span className="phone-avatar large" style={thread.character.avatarDataUrl ? { backgroundImage: `url(${thread.character.avatarDataUrl})` } : undefined}>{thread.character.avatarDataUrl ? "" : name.charAt(0)}</span>
                    <span><strong>{name}</strong><small>{thread.character.description || thread.story?.title || "剧情角色"}</small></span><i>›</i>
                  </button>;
                })}</div>
                <h4>当前使用者</h4>
                <button className="phone-contact-card" type="button" onClick={() => { setPhoneOpen(false); setPersonaOpen(true); }}>
                  <span className="phone-avatar large persona" style={runtime.activePersona?.avatarDataUrl ? { backgroundImage: `url(${runtime.activePersona.avatarDataUrl})` } : undefined}>{runtime.activePersona?.avatarDataUrl ? "" : (runtime.activePersona?.name ?? "我").charAt(0)}</span>
                  <span><strong>{runtime.activePersona?.name ?? "旅行者"}</strong><small>点击编辑或切换人设</small></span><i>›</i>
                </button>
              </div> : null}

              {phoneApp === "story" ? <div className="phone-story-page">
                <section className="phone-story-card"><small>CURRENT STORY</small><strong>{activeConversationTitle}</strong><p>{runtime.storyState?.scene || "故事状态会随主剧情同步更新。"}</p></section>
                <dl><div><dt>剧情时间</dt><dd>{new Date(phoneStoryTime).toLocaleString("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</dd></div><div><dt>地点</dt><dd>{runtime.storyState?.location || "未设置"}</dd></div><div><dt>天气</dt><dd>{runtime.storyState?.weather || "未设置"}</dd></div><div><dt>正式事件</dt><dd>{runtime.storyEvents.filter((event) => event.status === "committed").length}</dd></div></dl>
                <button className="phone-primary-action" type="button" onClick={() => { setPhoneOpen(false); setStoryTimelineOpen(true); }}>打开剧情时间线</button>
              </div> : null}

              {phoneApp === "notes" ? <div className="phone-notes-page"><h3>剧情备忘</h3>{(runtime.activeConversation?.checkpoints ?? []).map((checkpoint) => <div className="note-card" key={checkpoint.id}><strong>{checkpoint.label}</strong><p>{new Date(checkpoint.createdAt).toLocaleString("zh-CN")}</p></div>)}{approvedMemories.map((memory) => <div className="note-card" key={memory.id}><strong>长期记忆</strong><p>{memory.content}</p></div>)}{(runtime.activeConversation?.checkpoints?.length ?? 0) === 0 && approvedMemories.length === 0 ? <p className="phone-caption">在会话管理中创建章节点，或确认一条长期记忆。</p> : null}</div> : null}

              {phoneApp === "studio" ? <div className="phone-studio-page">
                <section className="phone-api-card"><span className={runtime.connectionStatus === "connected" ? "is-connected" : ""}>{runtime.connectionStatus === "connected" ? "已连接" : "未连接"}</span><small>LANGUAGE API</small><strong>{runtime.modelConfig.model || "尚未选择模型"}</strong><p>{runtime.modelConfig.baseUrl || "先在设置中填写兼容接口地址。"}</p><button type="button" onClick={() => openMainSectionFromPhone("settings")}>配置接口</button></section>
                <div className="phone-studio-heading"><span><strong>对话预设</strong><small>切换会立即影响主剧情与手机消息</small></span><button type="button" onClick={() => openMainSectionFromPhone("presets")}>管理</button></div>
                <div className="phone-preset-list">{runtime.presets.map((preset) => <button type="button" className={runtime.activePreset?.id === preset.id ? "is-active" : ""} key={preset.id} onClick={() => void runtime.activatePreset(preset.id)}><span><strong>{preset.name}</strong><small>{preset.modules?.filter((module) => module.enabled).length ?? 0} 个启用模块</small></span><i>{runtime.activePreset?.id === preset.id ? "✓" : ""}</i></button>)}{runtime.presets.length === 0 ? <p className="phone-caption">还没有预设，可从主界面的预设库创建或导入。</p> : null}</div>
                <section className="phone-image-card"><span>IMAGE STUDIO · {runtime.imageModelProfiles.find((profile) => profile.id === runtime.activeImageModelProfileId)?.name ?? "未配置"}</span><strong>{runtime.imageModelConfig.model || "生图工作室"}</strong><p>调用独立的生图 API；结果只保留在当前页面，除非你主动下载。</p><textarea value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} placeholder="描述画面、角色、构图与光线…" rows={4} />{runtime.generatedImage ? <><div className="phone-image-result" style={{ backgroundImage: `url(${JSON.stringify(runtime.generatedImage.imageUrl)})` }} role="img" aria-label="最近生成的图片" />{runtime.generatedImage.revisedPrompt ? <small className="phone-image-revised">{runtime.generatedImage.revisedPrompt}</small> : null}<a href={runtime.generatedImage.imageUrl} target="_blank" rel="noreferrer" download="lunemir-image.png">打开 / 下载图片</a></> : null}<div className="phone-image-actions"><button type="button" onClick={() => openMainSectionFromPhone("settings")}>配置接口</button><button type="button" className="phone-generate-image" onClick={() => void runtime.generateImage(imagePrompt)} disabled={!imagePrompt.trim() || runtime.imageGenerationStatus === "generating"}>{runtime.imageGenerationStatus === "generating" ? "生成中…" : "生成图片"}</button></div></section>
              </div> : null}

              {phoneApp === "settings" ? <div className="phone-settings-page">
                <section className="phone-profile-card"><span className="phone-avatar large persona" style={runtime.activePersona?.avatarDataUrl ? { backgroundImage: `url(${runtime.activePersona.avatarDataUrl})` } : undefined}>{runtime.activePersona?.avatarDataUrl ? "" : (runtime.activePersona?.name ?? "我").charAt(0)}</span><span><strong>{runtime.activePersona?.name ?? "旅行者"}</strong><small>Lunemir 本地档案</small></span></section>
                <div className="phone-setting-group">
                  <button type="button" onClick={() => openMainSectionFromPhone("themes")}><span><i className="violet">✦</i>界面与毛玻璃</span><b>›</b></button>
                  <button type="button" onClick={() => openMainSectionFromPhone("presets")}><span><i className="blue">≋</i>对话预设</span><b>{runtime.activePreset?.name || "未选择"} ›</b></button>
                  <button type="button" onClick={() => openMainSectionFromPhone("settings")}><span><i className="gray">⌁</i>模型与 API</span><b>{runtime.modelConfig.model || "未配置"} ›</b></button>
                </div>
                <section className="phone-size-setting">
                  <span><strong>手机尺寸</strong><small>保持手机比例，只改变悬浮窗口大小</small></span>
                  <div><button type="button" onClick={() => void runtime.saveAppearance({ ...runtime.appearance, phoneScale: Math.max(65, runtime.appearance.phoneScale - 5) })} aria-label="缩小手机">−</button><b>{runtime.appearance.phoneScale}%</b><button type="button" onClick={() => void runtime.saveAppearance({ ...runtime.appearance, phoneScale: Math.min(100, runtime.appearance.phoneScale + 5) })} aria-label="放大手机">＋</button></div>
                  <button className="phone-size-reset" type="button" onClick={() => void runtime.saveAppearance({ ...runtime.appearance, phoneScale: 82 })}>恢复默认大小</button>
                </section>
                <section className="phone-wallpaper-setting">
                  <span><strong>手机壁纸</strong><small>独立于聊天角色背景</small></span>
                  <div className="phone-wallpaper-options">
                    {(["moon", "aurora", "rose"] as const).map((wallpaper) => <button className={`${wallpaper}${runtime.appearance.phoneWallpaper === wallpaper ? " is-active" : ""}`} type="button" key={wallpaper} onClick={() => void runtime.saveAppearance({ ...runtime.appearance, phoneWallpaper: wallpaper, phoneWallpaperImage: undefined })} aria-label={`使用 ${wallpaper} 手机壁纸`} />)}
                    <label className={runtime.appearance.phoneWallpaper === "custom" ? "is-active" : ""}>＋<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void runtime.savePhoneWallpaper(file); event.currentTarget.value = ""; }} /></label>
                  </div>
                  <button className="phone-position-reset" type="button" onClick={() => { setPhoneButtonPosition(null); setPhonePanelPosition(null); phonePositionRef.current = { button: null, panel: null }; void runtime.saveAppearance({ ...runtime.appearance, phoneButtonPosition: undefined, phonePanelPosition: undefined }); }}>恢复手机默认位置</button>
                </section>
                <div className="phone-setting-group"><button type="button" onClick={() => setPhoneApp("story")}><span><i className="gold">◷</i>剧情状态</span><b>›</b></button><button type="button" onClick={() => setPhoneApp("contacts")}><span><i className="green">人</i>角色与人设</span><b>›</b></button></div>
                <p className="phone-privacy-note">角色、剧情、预设和手机记录默认保存在当前设备。API Key 不会显示在手机桌面。</p>
              </div> : null}
            </div>
          </div>}

          <button className="phone-home" type="button" onClick={() => { if (phoneApp === "home") setPhoneOpen(false); else { setPhoneApp("home"); setPhoneMessageView("list"); } }} aria-label={phoneApp === "home" ? "关闭手机" : "回到手机桌面"} />
        </div>
      </section>

      {sessionOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSessionOpen(false)}>
          <section className="session-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="session-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSessionOpen(false)} aria-label="关闭会话管理">×</button>
            <span className="eyebrow">STORY ARCHIVE</span>
            <h2 id="session-title">会话、章节与记忆</h2>
            <p className="session-intro">会话彼此独立；剧情分支会保留分支点之前的消息。只有确认后的记忆会进入模型上下文。</p>
            <div className="session-overview">
              <div><span>当前故事</span><strong>{runtime.activeConversation ? activeConversationTitle : "尚未开始"}</strong><small>{activeName} × {runtime.activePersona?.name ?? "旅行者"}</small></div>
              <dl><div><dt>消息</dt><dd>{runtime.messages.length}</dd></div><div><dt>章节点</dt><dd>{runtime.activeConversation?.checkpoints?.length ?? 0}</dd></div><div><dt>长期记忆</dt><dd>{approvedMemories.length}</dd></div></dl>
            </div>
            <div className="session-toolbar">
              <button className="primary-button" onClick={() => void runtime.createNewConversation()}>新建会话</button>
              <button onClick={() => void runtime.createCheckpoint()}>保存章节点</button>
              <button onClick={runtime.downloadConversation}>导出当前会话</button>
            </div>

            <div className="session-section">
              <div className="session-section-title"><strong>会话存档</strong><span>{filteredConversations.length}</span></div>
              <LibrarySearch label="搜索会话标题或最近消息" value={sessionQuery} count={filteredConversations.length} onChange={setSessionQuery} />
              <div className="session-list">
                {filteredConversations.map((item) => (
                  <article className={runtime.activeConversation?.id === item.id ? "session-row is-active" : "session-row"} key={item.id}>
                    {renamingConversationId === item.id ? (
                      <div className="session-rename"><input value={conversationTitle} onChange={(event) => setConversationTitle(event.target.value)} maxLength={80} autoFocus /><button onClick={() => { void runtime.renameConversation(item.id, conversationTitle); setRenamingConversationId(""); }}>保存</button><button onClick={() => setRenamingConversationId("")}>取消</button></div>
                    ) : <>
                      <button className="session-select" onClick={() => void runtime.selectConversation(item.id)}>
                        <strong>{item.title}{runtime.activeConversation?.id === item.id ? <em>当前</em> : null}</strong>
                        <small>{item.messages.length} 条消息 · {new Date(item.updatedAt).toLocaleString("zh-CN")}{item.parentConversationId ? " · 剧情分支" : ""}</small>
                      </button>
                      <LibraryActionMenu label={`管理会话 ${item.title}`} actions={[
                        { label: "重命名", onSelect: () => { setRenamingConversationId(item.id); setConversationTitle(item.title); } },
                        { label: "删除会话", danger: true, onSelect: () => { if (window.confirm(`删除会话“${item.title}”？此操作无法撤销。`)) return runtime.deleteConversation(item.id); } },
                      ]} />
                    </>}
                  </article>
                ))}
                {filteredConversations.length === 0 ? <div className="empty-state session-empty"><span>⌕</span><strong>没有匹配的会话</strong><p>换一个标题或最近消息关键词试试。</p></div> : null}
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

      {contextInspectorOpen && runtime.contextReport ? (
        <ContextInspectorModal
          report={runtime.contextReport}
          presetName={runtime.activePreset?.name}
          onClose={() => setContextInspectorOpen(false)}
        />
      ) : null}

      {storyGuidanceOpen ? (
        <StoryGuidanceModal
          authorNote={runtime.activeConversation?.authorNote}
          storySummary={runtime.activeConversation?.storySummary}
          messageCount={runtime.messages.length}
          onClose={() => setStoryGuidanceOpen(false)}
          onSaveAuthorNote={runtime.saveAuthorNote}
          onSaveSummary={runtime.saveStorySummary}
          onGenerateSummary={runtime.generateStorySummaryDraft}
        />
      ) : null}

      {storyTimelineOpen && runtime.storyState ? (
        <StoryTimelineModal
          key={runtime.storyState.updatedAt}
          storyState={runtime.storyState}
          storyEvents={runtime.storyEvents}
          npcStatus={runtime.phoneEventStatus}
          npcMessage={runtime.phoneEventMessage}
          onClose={() => setStoryTimelineOpen(false)}
          onSaveState={runtime.saveStoryState}
          onAdvanceTime={runtime.advanceStoryTime}
          onCheckNpc={() => runtime.requestPhoneEvent()}
          onRevertEvent={runtime.revertStoryEvent}
        />
      ) : null}

      {greetingPickerOpen && runtime.activeCharacter && greetingOptions.length > 0 ? (
        <GreetingPickerModal
          character={runtime.activeCharacter}
          personaName={runtime.activePersona?.name}
          currentGreeting={currentOpeningGreeting}
          createsNewConversation={greetingCreatesNewConversation}
          onClose={() => setGreetingPickerOpen(false)}
          onApply={runtime.applyOpeningGreeting}
        />
      ) : null}

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

      {lorebookEditor && (
        <LorebookEditorModal
          key={lorebookEditor.mode === "edit" ? lorebookEditor.id : lorebookEditor.mode === "embedded" ? `embedded-${lorebookEditor.characterId}` : "new-lorebook"}
          lorebook={editorLorebook}
          onClose={() => setLorebookEditor(null)}
          onSave={async (values) => {
            const saved = lorebookEditor.mode === "embedded"
              ? await runtime.saveCharacterLorebook(lorebookEditor.characterId, values)
              : await runtime.saveLorebookProfile(lorebookEditor.mode === "edit" ? lorebookEditor.id : undefined, values);
            if (saved) setLorebookEditor(null);
          }}
          onDuplicate={editorLorebook && lorebookEditor.mode === "edit" ? async () => {
            const duplicate = await runtime.duplicateLorebook(editorLorebook.id);
            if (duplicate) setLorebookEditor({ mode: "edit", id: duplicate.id });
          } : undefined}
          onExport={editorLorebook && lorebookEditor.mode === "edit" ? () => runtime.downloadLorebook(editorLorebook.id) : undefined}
          onDelete={editorLorebook && lorebookEditor.mode === "edit" ? async () => {
            if (!window.confirm(`删除世界书“${editorLorebook.name}”？它会同时从所有角色的启用列表中移除。`)) return;
            if (await runtime.deleteLorebookProfile(editorLorebook.id)) setLorebookEditor(null);
          } : undefined}
        />
      )}

      {presetEditor && (
        <PresetEditorModal
          key={presetEditor.mode === "edit" ? presetEditor.id : "new-preset"}
          preset={editorPreset}
          onClose={() => setPresetEditor(null)}
          onSave={async (values) => {
            const saved = await runtime.savePresetProfile(presetEditor.mode === "edit" ? presetEditor.id : undefined, values);
            if (saved) setPresetEditor(null);
          }}
          onDuplicate={editorPreset ? async () => {
            const duplicate = await runtime.duplicatePreset(editorPreset.id);
            if (duplicate) setPresetEditor({ mode: "edit", id: duplicate.id });
          } : undefined}
          onExport={editorPreset ? () => runtime.downloadPreset(editorPreset.id) : undefined}
          onDelete={editorPreset ? async () => {
            if (!window.confirm(`删除预设“${editorPreset.name}”？此操作不会删除角色或聊天记录。`)) return;
            if (await runtime.deletePresetProfile(editorPreset.id)) setPresetEditor(null);
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
        <PersonaManagerModal
          personas={runtime.personas}
          activePersonaId={runtime.activePersona?.id ?? ""}
          storyLabel={activeConversationTitle}
          onClose={() => setPersonaOpen(false)}
          onSave={runtime.savePersonaProfile}
          onActivate={runtime.activatePersona}
          onDuplicate={runtime.duplicatePersona}
          onDelete={runtime.deletePersonaProfile}
        />
      )}
    </main>
  );
}
