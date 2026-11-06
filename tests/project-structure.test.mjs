import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the Lunemir product surface", async () => {
  const [layout, prototype, netlify] = await Promise.all([
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("netlify.toml", root), "utf8"),
  ]);

  assert.match(layout, /Lunemir/);
  assert.match(prototype, /Lunemir Phone/i);
  assert.match(prototype, /世界书/);
  assert.match(netlify, /publish = "out"/);
});

test("keeps every workspace page behind one immersive navigation drawer", async () => {
  const [prototype, styles] = await Promise.all([
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(prototype, /navigation-trigger/);
  assert.match(prototype, /navigation-drawer/);
  assert.match(prototype, /navigateTo\(item\.id\)/);
  assert.doesNotMatch(prototype, /className="side-rail"/);
  assert.match(styles, /\.navigation-drawer\.is-open/);
  assert.match(styles, /\.navigation-backdrop\.is-open/);
});

test("ships searchable libraries with non-duplicated management menus", async () => {
  const [prototype, styles] = await Promise.all([
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(prototype, /LibrarySearch/);
  assert.match(prototype, /LibraryActionMenu/);
  assert.match(prototype, /filteredCharacters/);
  assert.match(prototype, /filteredLorebooks/);
  assert.match(prototype, /filteredPresets/);
  assert.doesNotMatch(prototype, /className="character-manage"/);
  assert.doesNotMatch(prototype, />打开编辑</);
  assert.match(styles, /\.library-action-menu/);
  assert.match(styles, /\.character-editor-actions\{position:sticky/);
});

test("includes product and architecture documentation", async () => {
  await Promise.all([
    access(new URL("docs/PRODUCT_REQUIREMENTS.md", root)),
    access(new URL("docs/ARCHITECTURE.md", root)),
    access(new URL("docs/COMPATIBILITY.md", root)),
    access(new URL("README.md", root)),
  ]);
});

test("ships a local-first persistence and backup layer", async () => {
  const storage = await readFile(new URL("lib/lunemir/storage.ts", root), "utf8");
  assert.match(storage, /indexedDB\.open/);
  assert.match(storage, /lunemir-backup/);
  assert.match(storage, /CHARACTER_STORE/);
  assert.match(storage, /CONVERSATION_STORE/);
  assert.match(storage, /LOREBOOK_STORE/);
  assert.match(storage, /PERSONA_STORE/);
  assert.match(storage, /PRESET_STORE/);
  assert.match(storage, /schemaVersion: 6/);
  assert.match(storage, /unique: false/);
  assert.match(storage, /STORY_EVENT_STORE/);
});

test("links committed phone events with the main story context", async () => {
  const [events, storage, runtime, context, prototype] = await Promise.all([
    readFile(new URL("lib/lunemir/story-events.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/storage.ts", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/context.ts", root), "utf8"),
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
  ]);

  assert.match(events, /parsePhoneMessageProposal/);
  assert.match(events, /validateStoryEvent/);
  assert.match(events, /isDuplicatePhoneEvent/);
  assert.match(storage, /listStoryEvents/);
  assert.match(storage, /saveStoryEvent/);
  assert.match(runtime, /requestPhoneEvent/);
  assert.match(runtime, /sendPhoneMessage/);
  assert.match(runtime, /markPhoneEventsRead/);
  assert.match(context, /已确认的手机通信事件/);
  assert.match(prototype, /检查新消息/);
  assert.match(prototype, /回复.*activeName/);
});

test("supports real character cards and compatible streaming", async () => {
  const [importer, client, context] = await Promise.all([
    readFile(new URL("lib/lunemir/character-import.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/model-client.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/context.ts", root), "utf8"),
  ]);

  assert.match(importer, /chunks\.get\("ccv3"\) \?\? chunks\.get\("chara"\)/);
  assert.match(importer, /chara_card_v3/);
  assert.match(importer, /chara_card_v2/);
  assert.match(client, /\/chat\/completions/);
  assert.match(client, /text\/event-stream/);
  assert.match(context, /matchedLore/);
  assert.match(context, /estimatedTokens/);
});

test("supports standalone content and conversation controls", async () => {
  const [contentImport, runtime, prototype, appearance] = await Promise.all([
    readFile(new URL("lib/lunemir/content-import.ts", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/components/ChatAppearancePanel.tsx", root), "utf8"),
  ]);

  assert.match(contentImport, /kind: "lorebook"/);
  assert.match(contentImport, /kind: "preset"/);
  assert.match(contentImport, /openai_max_context/);
  assert.match(runtime, /toggleLorebookAssignment/);
  assert.match(runtime, /savePersonaProfile/);
  assert.match(runtime, /regenerateLastReply/);
  assert.match(runtime, /continueLastReply/);
  assert.match(runtime, /selectMessageAlternative/);
  assert.match(runtime, /saveAppearance/);
  assert.match(runtime, /downloadConversation/);
  assert.match(runtime, /saveCustomBackground/);
  assert.match(runtime, /createNewConversation/);
  assert.match(runtime, /branchConversation/);
  assert.match(runtime, /deleteMessage/);
  assert.match(runtime, /createCheckpoint/);
  assert.match(runtime, /addMemoryCandidate/);
  assert.match(prototype, /重新生成/);
  assert.match(prototype, /继续生成/);
  assert.match(prototype, /导出当前会话/);
  assert.match(prototype, /会话、章节与记忆/);
  assert.doesNotMatch(prototype, /aria-label="添加附件"/);
  assert.match(prototype, /onPointerDown/);
  assert.match(appearance, /全屏/);
  assert.match(appearance, /角色卡图片/);
});

test("ships persistent UI 2.0 chat appearance controls", async () => {
  const [prototype, appearance, glass, types, defaults, styles] = await Promise.all([
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/components/ChatAppearancePanel.tsx", root), "utf8"),
    readFile(new URL("app/components/GlassPanel.tsx", root), "utf8"),
    readFile(new URL("lib/lunemir/types.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/defaults.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(prototype, /data-message-style/);
  assert.match(prototype, /showCharacterAvatar/);
  assert.match(prototype, /回到最新消息/);
  assert.match(appearance, /沉浸式|小说流/);
  assert.match(appearance, /毛玻璃范围与质感/);
  assert.match(appearance, /手机两侧留白/);
  assert.match(glass, /lm-glass-opacity/);
  assert.match(types, /glassScope/);
  assert.match(types, /mobileReadingInset/);
  assert.match(defaults, /messageStyle: "novel-flow"/);
  assert.match(defaults, /mobileReadingInset: 14/);
  assert.match(styles, /only|data-glass-scope/);
  assert.match(styles, /height:100dvh/);
  assert.match(styles, /--lm-mobile-reading-inset/);
});

test("supports persistent character card management", async () => {
  const [editor, runtime, storage, importer] = await Promise.all([
    readFile(new URL("app/components/CharacterEditorModal.tsx", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/storage.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/character-import.ts", root), "utf8"),
  ]);
  assert.match(editor, /创建新角色/);
  assert.match(editor, /高级提示词/);
  assert.match(editor, /导出 V2 JSON/);
  assert.match(runtime, /saveCharacterProfile/);
  assert.match(runtime, /duplicateCharacter/);
  assert.match(runtime, /deleteCharacterProfile/);
  assert.match(runtime, /downloadCharacter/);
  assert.match(storage, /deleteCharacter/);
  assert.match(importer, /avatar_data_url/);
});

test("supports persistent visual lorebook management", async () => {
  const [editor, runtime, storage, context] = await Promise.all([
    readFile(new URL("app/components/LorebookEditorModal.tsx", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/storage.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/context.ts", root), "utf8"),
  ]);
  assert.match(editor, /创建新世界书/);
  assert.match(editor, /主要关键词/);
  assert.match(editor, /组合触发/);
  assert.match(editor, /保存世界书/);
  assert.match(runtime, /saveLorebookProfile/);
  assert.match(runtime, /duplicateLorebook/);
  assert.match(runtime, /deleteLorebookProfile/);
  assert.match(runtime, /downloadLorebook/);
  assert.match(storage, /deleteLorebook/);
  assert.match(context, /right\.priority - left\.priority/);
});

test("supports visual prompt preset composition and conflict checks", async () => {
  const [editor, runtime, storage, context, importer, presetLogic] = await Promise.all([
    readFile(new URL("app/components/PresetEditorModal.tsx", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/storage.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/context.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/content-import.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/preset.ts", root), "utf8"),
  ]);
  assert.match(editor, /创建新预设/);
  assert.match(editor, /插入位置/);
  assert.match(editor, /保存并应用/);
  assert.match(runtime, /savePresetProfile/);
  assert.match(runtime, /duplicatePreset/);
  assert.match(runtime, /deletePresetProfile/);
  assert.match(runtime, /downloadPreset/);
  assert.match(storage, /deletePreset/);
  assert.match(context, /resolvePresetPrompts/);
  assert.match(importer, /lunemir_position/);
  assert.match(presetLogic, /analyzePromptModules/);
  assert.match(presetLogic, /第一人称/);
});

test("supports persistent personas bound to individual stories", async () => {
  const [manager, runtime, storage, context, types] = await Promise.all([
    readFile(new URL("app/components/PersonaManagerModal.tsx", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/storage.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/context.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/types.ts", root), "utf8"),
  ]);
  assert.match(manager, /创建并应用/);
  assert.match(manager, /应用到当前剧情/);
  assert.match(manager, /选择头像/);
  assert.match(runtime, /activatePersona/);
  assert.match(runtime, /duplicatePersona/);
  assert.match(runtime, /deletePersonaProfile/);
  assert.match(runtime, /personaAssignments/);
  assert.match(storage, /deletePersona/);
  assert.match(context, /人物关系/);
  assert.match(types, /avatarDataUrl/);
});

test("ships immersive mobile, greeting, worldbook, and preset fixes", async () => {
  const [prototype, runtime, importer, contentImport, styles] = await Promise.all([
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/character-import.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/content-import.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(importer, /data\.first_message/);
  assert.match(importer, /data\.firstMessage/);
  assert.match(importer, /data\.greetings/);
  assert.match(importer, /readCharacterGreetings/);
  assert.match(contentImport, /"first_message"/);
  assert.match(runtime, /saveCharacterLorebook/);
  assert.match(runtime, /nextConversation\.messages\.length === 0/);
  assert.match(runtime, /recovered\.firstMessage/);
  assert.match(prototype, /WORLD INFO LIBRARY/);
  assert.match(prototype, /PROMPT PRESET LIBRARY/);
  assert.match(prototype, /data-has-background/);
  assert.doesNotMatch(prototype, /data-card preset-card/);
  assert.match(styles, /overflow-x:hidden/);
  assert.match(styles, /data-has-background="true"/);
});

test("supports alternate opening selection and an immersive compact chat", async () => {
  const [prototype, runtime, picker, editor, presetEditor, styles] = await Promise.all([
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("app/components/GreetingPickerModal.tsx", root), "utf8"),
    readFile(new URL("app/components/CharacterEditorModal.tsx", root), "utf8"),
    readFile(new URL("app/components/PresetEditorModal.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(runtime, /applyOpeningGreeting/);
  assert.match(runtime, /canReplaceCurrentOpening/);
  assert.match(picker, /选择.*的开场白/);
  assert.match(picker, /以此新建会话/);
  assert.match(editor, /alternateGreetings/);
  assert.match(prototype, /message-tools/);
  assert.doesNotMatch(prototype, /max="32000"/);
  assert.doesNotMatch(presetEditor, /max="32000"/);
  assert.match(styles, /greeting-picker/);
  assert.match(styles, /data-glass-mode="messages"/);
});

test("renders preset theater output without executing imported markup", async () => {
  const [renderer, component, editor, runtime, importer, prototype] = await Promise.all([
    readFile(new URL("lib/lunemir/output-renderer.ts", root), "utf8"),
    readFile(new URL("app/components/SafeMessageContent.tsx", root), "utf8"),
    readFile(new URL("app/components/PresetEditorModal.tsx", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/content-import.ts", root), "utf8"),
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
  ]);
  assert.match(renderer, /normalizeImportedOutputRenderer/);
  assert.match(renderer, /likelyUnsafeRegex/);
  assert.match(renderer, /script\|style\|iframe\|object\|embed/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML/);
  assert.match(component, /theater-card/);
  assert.match(editor, /小剧场与输出美化/);
  assert.match(editor, /Regex 美化规则/);
  assert.match(runtime, /lunemir_output_renderer/);
  assert.match(importer, /normalizeImportedOutputRenderer/);
  assert.match(prototype, /查看原文/);
});

test("keeps personas, story archives, and model settings useful on small screens", async () => {
  const [prototype, personaManager, styles] = await Promise.all([
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/components/PersonaManagerModal.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(prototype, /filteredConversations/);
  assert.match(prototype, /session-overview/);
  assert.match(prototype, /settings-card-grouped/);
  assert.match(personaManager, /visiblePersonas/);
  assert.match(personaManager, /persona-story-banner/);
  assert.match(personaManager, /persona-library-search/);
  assert.match(styles, /settings-field-grid\.three/);
  assert.match(styles, /persona-library-list>button\{flex:0 0 168px/);
});

test("inspects the exact prompt, active preset modules, and lore matches", async () => {
  const [context, types, inspector, prototype, styles] = await Promise.all([
    readFile(new URL("lib/lunemir/context.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/types.ts", root), "utf8"),
    readFile(new URL("app/components/ContextInspectorModal.tsx", root), "utf8"),
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(context, /promptMessages/);
  assert.match(context, /activeModules/);
  assert.match(context, /loreStats/);
  assert.match(types, /ContextPromptMessage/);
  assert.match(inspector, /复制完整上下文/);
  assert.match(inspector, /最终发送顺序/);
  assert.doesNotMatch(inspector, /dangerouslySetInnerHTML/);
  assert.match(prototype, /contextInspectorOpen/);
  assert.match(styles, /context-inspector-grid/);
});

test("persists author notes, confirmed summaries, and advanced lore triggers", async () => {
  const [types, storage, context, runtime, guidance, loreEditor, importer, prototype] = await Promise.all([
    readFile(new URL("lib/lunemir/types.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/storage.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/context.ts", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("app/components/StoryGuidanceModal.tsx", root), "utf8"),
    readFile(new URL("app/components/LorebookEditorModal.tsx", root), "utf8"),
    readFile(new URL("lib/lunemir/character-import.ts", root), "utf8"),
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
  ]);
  assert.match(types, /type AuthorNote/);
  assert.match(types, /type StorySummary/);
  assert.match(storage, /schemaVersion: 6/);
  assert.match(context, /已经确认的剧情摘要/);
  assert.match(context, /expiresAfterMessageCount/);
  assert.match(context, /deterministicPercent/);
  assert.match(context, /递归关键词触发/);
  assert.match(runtime, /generateStorySummaryDraft/);
  assert.match(runtime, /saveAuthorNote/);
  assert.match(guidance, /只有已确认摘要会进入模型上下文/);
  assert.match(loreEditor, /扫描深度/);
  assert.match(loreEditor, /概率触发/);
  assert.match(loreEditor, /递归触发/);
  assert.match(importer, /recursive_scanning/);
  assert.match(prototype, /StoryGuidanceModal/);
});

test("persists one story clock and drives bounded NPC initiative checks", async () => {
  const [types, events, runtime, context, timeline, prototype, styles] = await Promise.all([
    readFile(new URL("lib/lunemir/types.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/story-events.ts", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/context.ts", root), "utf8"),
    readFile(new URL("app/components/StoryTimelineModal.tsx", root), "utf8"),
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(types, /type StoryState/);
  assert.match(types, /weather: string/);
  assert.match(types, /time_advanced/);
  assert.match(events, /normalizeStoryState/);
  assert.match(runtime, /advanceStoryTime/);
  assert.match(runtime, /cooldownMinutes/);
  assert.match(runtime, /revertStoryEvent/);
  assert.match(context, /统一剧情状态/);
  assert.match(context, /当前天气/);
  assert.match(timeline, /一次推进只触发一次受控检查/);
  assert.match(timeline, /天气 \/ 环境/);
  assert.match(prototype, /剧情时间与事件/);
  assert.doesNotMatch(prototype, /scene-story-header/);
  assert.match(styles, /story-timeline-layout/);
  assert.doesNotMatch(styles, /scene-story-header/);
});

test("resolves persona macros and supports portrait-above-text appearance", async () => {
  const [macros, context, runtime, prototype, picker, appearance, defaults, styles] = await Promise.all([
    readFile(new URL("lib/lunemir/macros.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/context.ts", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/components/GreetingPickerModal.tsx", root), "utf8"),
    readFile(new URL("app/components/ChatAppearancePanel.tsx", root), "utf8"),
    readFile(new URL("lib/lunemir/defaults.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(macros, /PERSONA_MACRO/);
  assert.match(macros, /user_name/);
  assert.match(context, /replaceMacros\(message\.content\)/);
  assert.match(runtime, /replaceRoleMacros\(content/);
  assert.match(prototype, /displayContent/);
  assert.match(prototype, /novel-message-content/);
  assert.match(picker, /replaceRoleMacros\(greeting/);
  assert.match(appearance, /应用角色映幕/);
  assert.match(appearance, /头像在上/);
  assert.match(defaults, /avatarLayout: "header"/);
  assert.match(styles, /data-avatar-layout="header"/);
  assert.match(styles, /text-indent:2em/);
  assert.match(styles, /bottom:calc\(100% \+ 5px\)/);
});

test("ships a resizable iOS-inspired phone shell with real story-linked apps", async () => {
  const [prototype, styles, types, defaults, runtime] = await Promise.all([
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("lib/lunemir/types.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/defaults.ts", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
  ]);
  assert.match(prototype, /type PhoneApp = "home" \| "messages" \| "contacts" \| "story" \| "notes" \| "studio" \| "settings"/);
  assert.match(prototype, /主剧情和手机共用同一条时间线/);
  assert.match(prototype, /runtime\.sendPhoneMessage/);
  assert.match(prototype, /runtime\.activatePreset/);
  assert.match(prototype, /生图工作室/);
  assert.match(prototype, /不会用假图片冒充生成结果/);
  assert.match(styles, /Lunemir Phone OS/);
  assert.match(styles, /phone-conversation-list/);
  assert.match(styles, /aspect-ratio:350\/720/);
  assert.doesNotMatch(styles, /\.phone-shell\{inset:0!important;width:100%!important;height:100dvh!important/);
  assert.match(types, /phoneScale: number/);
  assert.match(defaults, /phoneScale: 82/);
  assert.match(runtime, /phoneScale: clamp/);
  assert.match(prototype, /恢复默认大小/);
});
