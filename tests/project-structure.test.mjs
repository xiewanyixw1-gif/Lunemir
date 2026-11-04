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
  assert.match(storage, /schemaVersion: 3/);
  assert.match(storage, /unique: false/);
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
