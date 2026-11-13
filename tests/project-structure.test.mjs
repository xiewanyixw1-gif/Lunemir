import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { buildPresetSandboxDocument, hasInteractivePresetMarkup } from "../lib/lunemir/preset-sandbox.mjs";

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
  assert.match(runtime, /sendPhoneMessageToStory/);
  assert.match(runtime, /markPhoneEventsRead/);
  assert.match(context, /已确认的手机通信事件/);
  assert.match(prototype, /检查新消息/);
  assert.match(prototype, /回复.*phoneActiveName/);
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
  assert.match(client, /config\.chatCompletionsPath/);
  assert.match(client, /text\/event-stream/);
  assert.match(client, /finish_reason/);
  assert.match(client, /max_completion_tokens/);
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
  assert.match(editor, /values\.signature/);
  assert.match(runtime, /signature: values\.signature\.trim\(\)/);
  assert.match(importer, /lunemirExtensions\.signature/);
});

test("keeps character signatures separate from greetings and phone status", async () => {
  const [prototype, runtime] = await Promise.all([
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
  ]);
  assert.match(prototype, /activeSignature/);
  assert.match(prototype, /runtime\.storyState\?\.location \|\| "地点未设定"/);
  assert.match(runtime, /`与 \$\{character\.nickname \|\| character\.name\} 的故事`/);
  assert.doesNotMatch(runtime, /title: options\.title \|\| replaceRoleMacros\(character\.firstMessage/);
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
  assert.match(runtime, /effectiveModelConfig/);
  assert.doesNotMatch(runtime, /setModelConfig\(\{ \.\.\.modelConfig, \.\.\.preset\.modelPatch/);
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

test("renders preset HTML and interactive theater code in isolated layers", async () => {
  const [renderer, component, editor, runtime, importer, prototype, context, sandbox] = await Promise.all([
    readFile(new URL("lib/lunemir/output-renderer.ts", root), "utf8"),
    readFile(new URL("app/components/SafeMessageContent.tsx", root), "utf8"),
    readFile(new URL("app/components/PresetEditorModal.tsx", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/content-import.ts", root), "utf8"),
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("lib/lunemir/context.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/preset-sandbox.mjs", root), "utf8"),
  ]);
  assert.match(renderer, /normalizeImportedOutputRenderer/);
  assert.match(renderer, /normalizeImportedPromptFilters/);
  assert.match(renderer, /applyPromptFilters/);
  assert.match(renderer, /promptOnly/);
  assert.match(renderer, /likelyUnsafeRegex/);
  assert.match(renderer, /iframe\|object\|embed/);
  assert.match(renderer, /if \(!preservePresetComponents\)/);
  assert.match(renderer, /presetUsesCustomPresentation/);
  assert.match(renderer, /hasCssTemplate/);
  assert.match(renderer, /script\\b\|<button/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML/);
  assert.match(component, /SAFE_HTML_TAGS/);
  assert.match(component, /new DOMParser/);
  assert.match(component, /attachShadow/);
  assert.match(component, /sandbox="allow-scripts"/);
  assert.match(sandbox, /connect-src 'none'/);
  assert.match(sandbox, /form-action 'none'/);
  assert.match(component, /event\.source !== iframeRef\.current\?\.contentWindow/);
  assert.match(component, /sanitizePresetCss/);
  assert.match(component, /replace\(\/url/);
  assert.match(component, /safeHref/);
  assert.match(component, /theater-card/);
  assert.match(component, /snowPattern/);
  assert.match(component, /unwrapSnowTheater/);
  assert.match(component, /native-widget/);
  assert.match(component, /safe-html-fence/);
  assert.match(component, /knownLabels/);
  assert.match(component, /isInertLoadingPlaceholder/);
  assert.match(component, /正在\|正为你/);
  assert.match(component, /rendering\|loading\|generating/);
  assert.doesNotMatch(component, /extractMessageStatus/);
  assert.doesNotMatch(component, /statusRowsFromText\(parsed\.body\.textContent/);
  assert.doesNotMatch(component, /data-lunemir-status-compat/);
  assert.match(component, /hasInteractivePresetMarkup/);
  assert.match(component, /buildPresetSandboxDocument/);
  assert.doesNotMatch(component, /script\[type=\"application\/json\"\]/);
  assert.doesNotMatch(component, /PresetCompatibilityContext/);
  assert.doesNotMatch(component, /尚无已确认的长期记忆/);
  assert.match(renderer, /:::status/);
  assert.match(renderer, /UI_PANEL/);
  assert.match(editor, /小剧场与输出美化/);
  assert.match(editor, /隔离渲染预设 HTML\/CSS/);
  assert.match(editor, /识别状态栏与原生组件/);
  assert.match(editor, /Regex 美化规则/);
  assert.match(editor, /renderer-import-summary/);
  assert.match(runtime, /lunemir_output_renderer/);
  assert.match(importer, /normalizeImportedOutputRenderer/);
  assert.match(importer, /normalizeImportedPromptFilters/);
  assert.match(importer, /raw\.findRegex/);
  assert.match(importer, /isPromptFilterOnlyPreset/);
  assert.match(prototype, /查看原文/);
  assert.match(prototype, /合并到当前预设/);
  assert.match(prototype, /达到输出上限/);
  assert.match(runtime, /finishReason/);
  assert.match(context, /当前角色卡或预设已经带有专属的状态栏\/Regex 后处理器/);
  assert.match(context, /applyPromptFilters/);
  assert.match(context, /replaceRandomMacros/);
  assert.match(context, /nativeWidgetRequested/);
  assert.match(context, /presentationPromptSource/);
  assert.match(context, /loreText/);
  assert.match(context, /snowTheaterProtocol/);
  assert.doesNotMatch(context, /preset\?\.outputRenderer\?\.enabled && rendererConfig\.widgets/);
  assert.match(runtime, /mergeIntoActivePreset/);
  assert.match(context, /原生组件回退协议/);
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

test("renders the main story as a semantic immersive reading surface", async () => {
  const [prototype, styles] = await Promise.all([
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(prototype, /aria-label="主剧情阅读区"/);
  assert.match(prototype, /role="log"/);
  assert.match(prototype, /<header className="message-meta">/);
  assert.match(prototype, /aria-describedby="composer-shortcut-hint"/);
  assert.doesNotMatch(prototype, /StoryReadingHeader/);
  assert.doesNotMatch(styles, /story-reading-header/);
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
  assert.match(prototype, /runtime\.sendPhoneMessageToStory/);
  assert.match(prototype, /runtime\.activatePreset/);
  assert.match(prototype, /生图工作室/);
  assert.match(prototype, /runtime\.generateImage\(imagePrompt\)/);
  assert.match(styles, /Lunemir Phone OS/);
  assert.match(styles, /phone-conversation-list/);
  assert.match(styles, /aspect-ratio:350\/720/);
  assert.match(styles, /width:var\(--lm-phone-width,287px\);height:var\(--lm-phone-height,590px\)/);
  assert.doesNotMatch(styles, /\.phone-shell\{inset:0!important;width:100%!important;height:100dvh!important/);
  assert.match(prototype, /"--lm-phone-width"/);
  assert.match(prototype, /const phoneShellStyle: CSSProperties/);
  assert.match(prototype, /minWidth: `\$\{phoneWidth\}px`/);
  assert.match(prototype, /maxHeight: `\$\{phoneHeight\}px`/);
  assert.match(prototype, /className="phone-wallpaper" style=\{phoneWallpaperStyle\}/);
  assert.match(prototype, /runtime\.allConversations/);
  assert.match(prototype, /runtime\.allStoryEvents/);
  assert.match(prototype, /搜索联系人或消息/);
  assert.match(types, /phoneScale: number/);
  assert.match(types, /phoneWallpaper:/);
  assert.match(defaults, /phoneScale: 82/);
  assert.match(runtime, /phoneScale: clamp/);
  assert.match(prototype, /恢复默认大小/);
  assert.match(styles, /contain:layout size style/);
});

test("supports multiple API provider presets, flexible model discovery, and real image generation", async () => {
  const [prototype, styles, types, defaults, runtime, client, storage] = await Promise.all([
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("lib/lunemir/types.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/defaults.ts", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/model-client.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/storage.ts", root), "utf8"),
  ]);
  assert.match(types, /export type ModelProfile/);
  assert.match(types, /export type ImageModelProfile/);
  assert.match(defaults, /DEFAULT_IMAGE_MODEL_CONFIG/);
  assert.match(client, /resolveApiEndpoint/);
  assert.match(client, /root\.models/);
  assert.match(client, /export async function generateImage/);
  assert.match(runtime, /createModelProfile/);
  assert.match(runtime, /createImageModelProfile/);
  assert.match(runtime, /modelApiKeys/);
  assert.match(runtime, /saveProviderApiKey/);
  assert.match(runtime, /const modelListChanged = normalized\.baseUrl/);
  assert.match(prototype, /新增站点/);
  assert.match(prototype, /新增生图站点/);
  assert.match(prototype, /尚未拉取模型/);
  assert.match(prototype, /拉取模型/);
  assert.match(prototype, /生成图片/);
  assert.match(styles, /provider-profile-toolbar/);
  assert.match(styles, /settings-card input,.settings-card select,.settings-card textarea\{font-size:16px\}/);
  assert.match(styles, /phone-image-result/);
  assert.match(storage, /DATABASE_VERSION = 5/);
  assert.match(storage, /providerSecrets/);
  assert.doesNotMatch(storage.slice(storage.indexOf("createBackup"), storage.indexOf("type RestorableBackup")), /listProviderApiKeys/);
});

test("shows model reasoning, safely renders HTML, and continues truncated streams", async () => {
  const [types, client, runtime, prototype, component, styles] = await Promise.all([
    readFile(new URL("lib/lunemir/types.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/model-client.ts", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/components/SafeMessageContent.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(types, /reasoning\?: string/);
  assert.match(types, /finishReason\?: string/);
  assert.match(client, /reasoning_content/);
  assert.match(client, /finish_reason/);
  assert.match(client, /buffer \+= decoder\.decode\(\)/);
  assert.match(runtime, /AUTO_CONTINUATION_LIMIT = 2/);
  assert.match(runtime, /splitEmbeddedReasoning/);
  assert.match(runtime, /上一条回复因输出上限被截断/);
  assert.match(prototype, /查看思考过程/);
  assert.match(component, /safeStyleValue/);
  assert.match(styles, /message-reasoning/);
  assert.match(styles, /safe-html-content table/);
});

test("builds one isolated interactive document with working local tab fallbacks", () => {
  const source = `<!doctype html><html><head><style>.panel{color:white}</style></head><body>
    <nav class="bottom-nav" role="tablist">
      <button role="tab" aria-controls="account">会所账单</button>
      <button role="tab" aria-controls="notes">私人备忘录</button>
    </nav>
    <section id="account" class="tab-pane">账单内容</section>
    <section id="notes" class="tab-pane">备忘内容</section>
  </body></html>`;
  const document = buildPresetSandboxDocument(source);

  assert.equal(hasInteractivePresetMarkup(source), true);
  assert.equal((document.match(/<html>/g) ?? []).length, 1);
  assert.match(document, /data-lunemir-sandbox-runtime/);
  assert.match(document, /activateDeclarativeTab/);
  assert.match(document, /MutationObserver\(scheduleSize\)/);
  assert.match(document, /removeStaleLoadingPlaceholders/);
  assert.match(document, /lunemir-preset-action/);
  assert.match(document, /sendSelectedOptions/);
  assert.match(document, /data-text/);
  assert.match(document, /connect-src 'none'/);
  assert.match(document, /form-action 'none'/);
  assert.doesNotMatch(document, /img-src[^;]*https?:/);
  assert.match(document, /会所账单/);
  assert.match(document, /私人备忘录/);
});

test("preserves advanced preset roles, depth limits, and unlabeled HTML output", async () => {
  const [types, importer, renderer, context, component, prototype] = await Promise.all([
    readFile(new URL("lib/lunemir/types.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/content-import.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/output-renderer.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/context.ts", root), "utf8"),
    readFile(new URL("app/components/SafeMessageContent.tsx", root), "utf8"),
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
  ]);
  assert.match(types, /role: Role/);
  assert.match(types, /maxDepth\?: number/);
  assert.match(importer, /const importedRole = asString\(prompt\.role\)/);
  assert.match(renderer, /rule\.maxDepth !== undefined && depth > rule\.maxDepth/);
  assert.match(context, /presetRoleMessages/);
  assert.match(component, /const unlabeledHtml/);
  assert.match(component, /lunemir-preset-action/);
  assert.match(prototype, /handlePresetAction/);
});

test("preserves preset structure markers and worldbook insertion positions", async () => {
  const [types, importer, characterImporter, context, presetLogic, presetEditor, lorebookEditor, runtime] = await Promise.all([
    readFile(new URL("lib/lunemir/types.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/content-import.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/character-import.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/context.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/preset.ts", root), "utf8"),
    readFile(new URL("app/components/PresetEditorModal.tsx", root), "utf8"),
    readFile(new URL("app/components/LorebookEditorModal.tsx", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
  ]);

  assert.match(types, /export type PresetPromptMarker/);
  assert.match(types, /"chatHistory"/);
  assert.match(types, /LorebookInsertionPosition/);
  assert.match(importer, /PRESET_MARKERS/);
  assert.match(importer, /prompt\.marker === true/);
  assert.match(characterImporter, /normalizeLorebookPosition/);
  assert.match(context, /usesPromptMarkers/);
  assert.match(context, /marker === "chatHistory"/);
  assert.match(context, /injectionsByIndex/);
  assert.match(context, /left\.order - right\.order \|\| right\.priority - left\.priority/);
  assert.match(presetLogic, /restorePresetStructureMarkers/);
  assert.match(presetLogic, /preset\.raw\?\.prompt_order/);
  assert.match(presetEditor, /restorePresetStructureMarkers/);
  assert.match(presetEditor, /结构插槽/);
  assert.match(lorebookEditor, /聊天历史中/);
  assert.match(runtime, /module\.marker \?\? module\.id/);
  assert.match(runtime, /insertionPosition === "in_history" \? 4/);
});

test("prioritizes character-card renderers without corrupting story paragraphs", async () => {
  const [types, importer, renderer, context, prototype, editor, component, styles] = await Promise.all([
    readFile(new URL("lib/lunemir/types.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/character-import.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/output-renderer.ts", root), "utf8"),
    readFile(new URL("lib/lunemir/context.ts", root), "utf8"),
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
    readFile(new URL("app/components/CharacterEditorModal.tsx", root), "utf8"),
    readFile(new URL("app/components/SafeMessageContent.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(types, /embeddedRendererEnabled\?: boolean/);
  assert.match(importer, /embedded_renderer_enabled !== false/);
  assert.match(renderer, /normalizeEmbeddedOutputRenderer/);
  assert.match(renderer, /resolveOutputRendererConfig/);
  assert.match(renderer, /normalizeLeakedStyleSource/);
  assert.match(renderer, /stripNativeFallbackSections/);
  assert.match(context, /CSS、<style>、完整 HTML 模板与样式说明由后处理器负责/);
  assert.match(context, /但没有可复用的 Regex 模板/);
  assert.match(context, /rendererProvidesTemplate/);
  assert.match(prototype, /resolveOutputRendererConfig/);
  assert.match(prototype, /自带状态栏/);
  assert.match(editor, /启用角色卡自带状态栏与美化/);
  assert.match(component, /\.lm-preset-root content\{display:block;white-space:pre-wrap/);
  assert.match(component, /useIsolatedRenderer/);
  assert.match(styles, /character-renderer-toggle/);
});

test("resolves imported theater random macros deterministically", async () => {
  const { replaceRandomMacros } = await import(new URL("lib/lunemir/macros.ts", root));
  const source = "{{random::微信聊天界面::论坛页面::手写信}} / {{random:晴天,雨天,雪天}}";
  const first = replaceRandomMacros(source, "story-001");
  const second = replaceRandomMacros(source, "story-001");
  assert.equal(first, second);
  assert.doesNotMatch(first, /\{\{\s*random/i);
  assert.match(first, /微信聊天界面|论坛页面|手写信/);
  assert.match(first, /晴天|雨天|雪天/);
});
