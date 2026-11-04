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
