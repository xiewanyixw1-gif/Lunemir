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
  assert.match(storage, /schemaVersion: 4/);
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
  const [contentImport, runtime, prototype] = await Promise.all([
    readFile(new URL("lib/lunemir/content-import.ts", root), "utf8"),
    readFile(new URL("app/hooks/useLunemirRuntime.ts", root), "utf8"),
    readFile(new URL("app/components/LunemirPrototype.tsx", root), "utf8"),
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
  assert.match(prototype, /全屏毛玻璃/);
  assert.match(prototype, /角色卡图片/);
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
  assert.match(contentImport, /"first_message"/);
  assert.match(runtime, /saveCharacterLorebook/);
  assert.match(runtime, /nextConversation\.messages\.length === 0/);
  assert.match(prototype, /WORLD INFO LIBRARY/);
  assert.match(prototype, /PROMPT PRESET LIBRARY/);
  assert.match(prototype, /data-has-background/);
  assert.doesNotMatch(prototype, /data-card preset-card/);
  assert.match(styles, /overflow-x:hidden/);
  assert.match(styles, /data-has-background="true"/);
});
