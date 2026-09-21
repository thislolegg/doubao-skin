import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../src/cli.mjs";

const loadedTheme = {
  manifest: {
    schemaVersion: 1,
    id: "jade-rabbit",
    name: "玉兔捣药",
    hero: "hero.webp",
  },
  heroPath: "/tmp/hero.webp",
};

function dependencies(overrides = {}) {
  return {
    listThemes: async () => [{ id: "jade-rabbit", path: "/tmp/theme.json" }],
    loadTheme: async () => loadedTheme,
    ...overrides,
  };
}

test("work client selects its isolated port and renderer", async () => {
  let received;
  await runCli(
    ["apply", "--client", "work"],
    dependencies({
      applySkin: async (options) => {
        received = options;
        return { applied: 1 };
      },
    }),
  );

  assert.equal(received.port, 9334);
  assert.equal(received.rendererHint, "doubaowork-chat");
});

test("personal client remains the default", async () => {
  let received;
  await runCli(
    ["status"],
    dependencies({
      skinStatus: async (options) => {
        received = options;
        return [];
      },
    }),
  );

  assert.equal(received.port, 9333);
  assert.equal(received.rendererHint, "doubao-chat");
});

test("supports equals syntax and rejects unknown clients", async () => {
  let received;
  await runCli(
    ["pause", "--client=work", "--port=9444"],
    dependencies({
      removeSkin: async (options) => {
        received = options;
        return { removed: 0 };
      },
    }),
  );

  assert.equal(received.port, 9444);
  assert.equal(received.rendererHint, "doubaowork-chat");
  await assert.rejects(
    runCli(["status", "--client", "unknown"], dependencies()),
    /--client 必须是 personal 或 work/,
  );
});
