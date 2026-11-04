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
  assert.match(prototype, /Lunemir Phone/);
  assert.match(prototype, /世界书/);
  assert.match(netlify, /publish = "out"/);
});

test("includes product and architecture documentation", async () => {
  await Promise.all([
    access(new URL("docs/PRODUCT_REQUIREMENTS.md", root)),
    access(new URL("docs/ARCHITECTURE.md", root)),
    access(new URL("README.md", root)),
  ]);
});
