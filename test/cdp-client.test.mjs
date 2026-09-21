import assert from "node:assert/strict";
import test from "node:test";

import { filterRendererTargets } from "../src/cdp-client.mjs";

const targets = [
  {
    id: "work",
    type: "page",
    url: "chrome://doubaowork-chat/",
    webSocketDebuggerUrl: "ws://127.0.0.1:9334/devtools/page/work",
  },
  {
    id: "personal",
    type: "page",
    url: "doubao://doubao-chat/",
    webSocketDebuggerUrl: "ws://127.0.0.1:9333/devtools/page/personal",
  },
  {
    id: "unrelated",
    type: "page",
    url: "https://www.doubao.com/",
    webSocketDebuggerUrl: "ws://127.0.0.1:9333/devtools/page/unrelated",
  },
];

test("filters personal and work renderer targets independently", () => {
  assert.deepEqual(
    filterRendererTargets(targets).map(({ id }) => id),
    ["personal"],
  );
  assert.deepEqual(
    filterRendererTargets(targets, { rendererHint: "doubaowork-chat" }).map(({ id }) => id),
    ["work"],
  );
});

test("rejects an empty renderer hint", () => {
  assert.throws(
    () => filterRendererTargets(targets, { rendererHint: "" }),
    /rendererHint must be a non-empty string/,
  );
});
