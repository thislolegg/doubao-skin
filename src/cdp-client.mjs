import net from "node:net";
import { createHash, randomBytes } from "node:crypto";

import { RENDERER_URL_HINT } from "./constants.mjs";

// Node 18/20 没有全局 WebSocket（Node 22+ 才有）。为了让工具在 Node 18+ 都能用，
// 这里内置一个极简、无依赖的 ws:// 客户端（仅回环 CDP 用，不实现 TLS）。
// 接口对齐浏览器 WebSocket：onopen/onmessage/onerror/onclose + send/close + readyState。
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export class NodeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = NodeWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this._buffer = Buffer.alloc(0);
    this._handshakeDone = false;
    this._closeEmitted = false;
    this._fragments = [];
    this._fragmentOpcode = null;

    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      queueMicrotask(() => this._fail(new Error(`invalid ws url: ${url}`)));
      return;
    }
    const port = Number(parsed.port);
    const key = randomBytes(16).toString("base64");
    this._acceptExpected = createHash("sha1").update(key + WS_GUID).digest("base64");

    this.socket = net.connect({ host: parsed.hostname, port }, () => {
      const path = `${parsed.pathname}${parsed.search || ""}`;
      this.socket.write(
        `GET ${path} HTTP/1.1\r\n` +
        `Host: ${parsed.hostname}:${port}\r\n` +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Key: ${key}\r\n` +
        "Sec-WebSocket-Version: 13\r\n\r\n",
      );
    });
    this.socket.on("data", (chunk) => this._onData(chunk));
    this.socket.on("error", (error) => this._fail(error));
    this.socket.on("close", () => this._emitClose(1006, ""));
  }

  _fail(error) {
    if (this.readyState === NodeWebSocket.CLOSED) return;
    this.readyState = NodeWebSocket.CLOSED;
    this.onerror?.({ error, message: error?.message });
    this._emitClose(1006, error?.message || "");
  }

  _emitClose(code, reason) {
    if (this._closeEmitted) return;
    this._closeEmitted = true;
    this.readyState = NodeWebSocket.CLOSED;
    try {
      this.socket?.destroy();
    } catch {
      // socket already gone
    }
    this.onclose?.({ code, reason });
  }

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    if (!this._handshakeDone) {
      const marker = this._buffer.indexOf("\r\n\r\n");
      if (marker === -1) return;
      const header = this._buffer.subarray(0, marker).toString("utf8");
      const statusLine = header.split("\r\n")[0] || "";
      if (!/\b101\b/.test(statusLine)) {
        this._fail(new Error(`ws handshake failed: ${statusLine}`));
        return;
      }
      this._handshakeDone = true;
      this._buffer = this._buffer.subarray(marker + 4);
      this.readyState = NodeWebSocket.OPEN;
      this.onopen?.({});
    }
    this._parseFrames();
  }

  _parseFrames() {
    while (true) {
      if (this._buffer.length < 2) return;
      const b0 = this._buffer[0];
      const b1 = this._buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let length = b1 & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this._buffer.length < offset + 2) return;
        length = this._buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this._buffer.length < offset + 8) return;
        length = Number(this._buffer.readBigUInt64BE(offset));
        offset += 8;
      }
      let maskKey = null;
      if (masked) {
        if (this._buffer.length < offset + 4) return;
        maskKey = this._buffer.subarray(offset, offset + 4);
        offset += 4;
      }
      if (this._buffer.length < offset + length) return;
      const payload = this._buffer.subarray(offset, offset + length);
      this._buffer = this._buffer.subarray(offset + length);
      if (maskKey) {
        for (let i = 0; i < payload.length; i += 1) payload[i] ^= maskKey[i & 3];
      }

      if (opcode === 0x8) {
        this._emitClose(1000, "");
        return;
      }
      if (opcode === 0x9) {
        this._sendFrame(0xa, payload);
        continue;
      }
      if (opcode === 0xa) continue;
      if (opcode === 0x0) {
        this._fragments.push(payload);
        if (fin) {
          const full = Buffer.concat(this._fragments);
          const op = this._fragmentOpcode;
          this._fragments = [];
          this._fragmentOpcode = null;
          if (op === 0x1) this.onmessage?.({ data: full.toString("utf8") });
        }
        continue;
      }
      // 0x1 text / 0x2 binary
      if (!fin) {
        this._fragmentOpcode = opcode;
        this._fragments = [payload];
        continue;
      }
      if (opcode === 0x1) this.onmessage?.({ data: payload.toString("utf8") });
    }
  }

  _sendFrame(opcode, payload) {
    const mask = randomBytes(4);
    const length = payload.length;
    let header;
    if (length < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    header[0] = 0x80 | opcode;
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i += 1) masked[i] ^= mask[i & 3];
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  send(data) {
    if (this.readyState !== NodeWebSocket.OPEN) throw new Error("CDP socket is not open");
    this._sendFrame(0x1, Buffer.from(String(data), "utf8"));
  }

  close() {
    if (this.readyState === NodeWebSocket.CLOSED || this.readyState === NodeWebSocket.CLOSING) return;
    this.readyState = NodeWebSocket.CLOSING;
    try {
      this._sendFrame(0x8, Buffer.alloc(0));
    } catch {
      // best effort close
    }
    this._emitClose(1000, "");
  }
}

const MIN_PORT = 1024;
const MAX_PORT = 65535;
const DEFAULT_WAIT_TIMEOUT_MS = 5000;
const DEFAULT_POLL_MS = 100;
const DEFAULT_COMMAND_TIMEOUT_MS = 5000;
const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 5000;

function validatePort(port) {
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new TypeError(
      `port must be an integer from ${MIN_PORT} through ${MAX_PORT}`,
    );
  }
  return port;
}

function validateDuration(value, name, { allowZero }) {
  const minimum = allowZero ? 0 : Number.EPSILON;
  if (!Number.isFinite(value) || value < minimum) {
    const qualifier = allowZero ? "non-negative" : "positive";
    throw new TypeError(`${name} must be a finite ${qualifier} number`);
  }
  return value;
}

function validateRendererUrlHint(rendererHint) {
  if (
    typeof rendererHint !== "string" ||
    rendererHint.length === 0 ||
    rendererHint !== rendererHint.trim()
  ) {
    throw new TypeError("rendererHint must be a non-empty string");
  }
  return rendererHint;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseLoopbackWebSocketUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new TypeError("webSocketDebuggerUrl must be a non-empty URL string");
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new TypeError(`webSocketDebuggerUrl is invalid: ${errorMessage(error)}`, {
      cause: error,
    });
  }

  if (
    parsed.protocol !== "ws:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    !parsed.port
  ) {
    throw new TypeError(
      "webSocketDebuggerUrl must use ws://127.0.0.1 with an explicit port",
    );
  }

  validatePort(Number(parsed.port));
  return parsed;
}

// renderer 使用客户端专属 host，例如 doubao-chat 或 doubaowork-chat。
function isRendererTarget(target, rendererHint) {
  if (
    target === null ||
    typeof target !== "object" ||
    Array.isArray(target) ||
    target.type !== "page" ||
    typeof target.url !== "string" ||
    !target.url.includes(rendererHint)
  ) {
    return false;
  }

  try {
    parseLoopbackWebSocketUrl(target.webSocketDebuggerUrl);
    return true;
  } catch {
    return false;
  }
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareTargets(left, right) {
  const leftKeys = [
    String(left.id ?? ""),
    left.url,
    left.webSocketDebuggerUrl,
  ];
  const rightKeys = [
    String(right.id ?? ""),
    right.url,
    right.webSocketDebuggerUrl,
  ];

  for (let index = 0; index < leftKeys.length; index += 1) {
    const comparison = compareText(leftKeys[index], rightKeys[index]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function sleepWithTimer(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function awaitBeforeDeadline(
  promise,
  { deadline, timeoutMs, label, onTimeout },
) {
  const remainingMs = Math.max(0, deadline - Date.now());
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, remainingMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function buildHttpError(response) {
  const status = Number.isInteger(response?.status)
    ? String(response.status)
    : "unknown status";
  const statusText =
    typeof response?.statusText === "string" && response.statusText.length > 0
      ? ` ${response.statusText}`
      : "";
  return new Error(`renderer target discovery failed with HTTP ${status}${statusText}`);
}

function buildCdpError(method, payload) {
  const code = payload && Object.hasOwn(payload, "code") ? payload.code : undefined;
  const message =
    typeof payload?.message === "string" ? payload.message : "unknown CDP error";
  const codeText = code === undefined ? "" : ` (${code})`;
  const error = new Error(`CDP ${method} failed${codeText}: ${message}`);
  error.name = "CdpProtocolError";
  if (code !== undefined) error.code = code;
  if (payload && Object.hasOwn(payload, "data")) error.data = payload.data;
  return error;
}

function buildEvaluationError(exceptionDetails) {
  const description = exceptionDetails?.exception?.description;
  const text = exceptionDetails?.text;
  const detail =
    typeof description === "string" && description.length > 0
      ? description
      : typeof text === "string" && text.length > 0
        ? text
        : "unknown JavaScript exception";
  const error = new Error(`Runtime.evaluate failed: ${detail}`);
  error.name = "CdpEvaluationError";
  error.exceptionDetails = exceptionDetails;
  return error;
}

export function filterRendererTargets(
  targets,
  { rendererHint = RENDERER_URL_HINT } = {},
) {
  if (!Array.isArray(targets)) {
    throw new TypeError("renderer targets must be an array");
  }
  validateRendererUrlHint(rendererHint);
  return targets
    .filter((target) => isRendererTarget(target, rendererHint))
    .sort(compareTargets);
}

export async function fetchRendererTargets(
  port,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_DISCOVERY_TIMEOUT_MS,
    rendererHint = RENDERER_URL_HINT,
  } = {},
) {
  validatePort(port);
  validateDuration(timeoutMs, "timeoutMs", { allowZero: false });
  validateRendererUrlHint(rendererHint);
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }

  const endpoint = `http://127.0.0.1:${port}/json/list`;
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  let response;
  try {
    response = await awaitBeforeDeadline(
      Promise.resolve(
        fetchImpl(endpoint, { redirect: "error", signal: controller.signal }),
      ),
      {
        deadline,
        timeoutMs,
        label: "renderer target discovery",
        onTimeout: () => controller.abort(),
      },
    );
  } catch (error) {
    throw new Error(
      `failed to fetch renderer targets from ${endpoint}: ${errorMessage(error)}`,
      { cause: error },
    );
  }

  if (response === null || typeof response !== "object" || response.ok !== true) {
    throw buildHttpError(response);
  }
  if (typeof response.json !== "function") {
    throw new Error("malformed renderer target response: missing JSON body reader");
  }

  let targets;
  try {
    targets = await awaitBeforeDeadline(Promise.resolve(response.json()), {
      deadline,
      timeoutMs,
      label: "renderer target discovery JSON",
      onTimeout: () => controller.abort(),
    });
  } catch (error) {
    throw new Error(
      `malformed renderer target JSON from ${endpoint}: ${errorMessage(error)}`,
      { cause: error },
    );
  }
  if (!Array.isArray(targets)) {
    throw new Error("malformed renderer target JSON: expected an array");
  }

  return filterRendererTargets(targets, { rendererHint });
}

export async function waitForRendererTargets(
  port,
  {
    timeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
    pollMs = DEFAULT_POLL_MS,
    fetchImpl = globalThis.fetch,
    sleep = sleepWithTimer,
    rendererHint = RENDERER_URL_HINT,
  } = {},
) {
  validatePort(port);
  validateDuration(timeoutMs, "timeoutMs", { allowZero: true });
  validateDuration(pollMs, "pollMs", { allowZero: false });
  validateRendererUrlHint(rendererHint);
  if (typeof sleep !== "function") {
    throw new TypeError("sleep must be a function");
  }

  let elapsedMs = 0;
  const deadline = Date.now() + timeoutMs;
  let lastError = new Error("no renderer discovery attempt completed");

  while (true) {
    try {
      const remainingBudgetMs = Math.max(
        1,
        Math.min(timeoutMs - elapsedMs, deadline - Date.now()),
      );
      const targets = await fetchRendererTargets(port, {
        fetchImpl,
        timeoutMs: remainingBudgetMs,
        rendererHint,
      });
      if (targets.length > 0) return targets;
      lastError = new Error(`no matching ${rendererHint} page targets`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (elapsedMs >= timeoutMs || Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for renderer targets on 127.0.0.1:${port}: ${lastError.message}`,
        { cause: lastError },
      );
    }

    const delayMs = Math.min(pollMs, timeoutMs - elapsedMs);
    await sleep(delayMs);
    elapsedMs += delayMs;
  }
}

export class CdpSession {
  constructor(
    webSocketDebuggerUrl,
    {
      // Node 18/20 无全局 WebSocket 时，回退到内置的 NodeWebSocket，保证 Node 18+ 都能用
      WebSocketImpl = globalThis.WebSocket ?? NodeWebSocket,
      commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
      connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
    } = {},
  ) {
    parseLoopbackWebSocketUrl(webSocketDebuggerUrl);
    if (typeof WebSocketImpl !== "function") {
      throw new TypeError("WebSocketImpl must be a WebSocket constructor");
    }
    validateDuration(commandTimeoutMs, "commandTimeoutMs", { allowZero: false });
    validateDuration(connectTimeoutMs, "connectTimeoutMs", { allowZero: false });

    this.webSocketDebuggerUrl = webSocketDebuggerUrl;
    this.WebSocketImpl = WebSocketImpl;
    this.commandTimeoutMs = commandTimeoutMs;
    this.connectTimeoutMs = connectTimeoutMs;
    this.socket = null;
    this.nextRequestId = 1;
    this.pending = new Map();
    this.socketOpen = false;
    this.opened = false;
    this.closed = false;
    this.closeStarted = false;
    this.terminalError = null;
    this.openPromise = null;
    this.resolveOpen = null;
    this.rejectOpen = null;
    this.connectTimer = null;
  }

  open() {
    if (this.closed) {
      return Promise.reject(this.terminalError ?? new Error("CDP session is closed"));
    }
    if (this.opened) return Promise.resolve(this);
    if (this.openPromise) return this.openPromise;

    this.openPromise = new Promise((resolve, reject) => {
      this.resolveOpen = resolve;
      this.rejectOpen = reject;
    });
    this.connectTimer = setTimeout(() => {
      this.terminate(
        new Error(
          `CDP WebSocket connect timed out after ${this.connectTimeoutMs}ms`,
        ),
      );
      this.closeSocket();
    }, this.connectTimeoutMs);

    try {
      this.socket = new this.WebSocketImpl(this.webSocketDebuggerUrl);
    } catch (error) {
      this.terminate(
        new Error(`failed to open CDP WebSocket: ${errorMessage(error)}`, {
          cause: error,
        }),
      );
      return this.openPromise;
    }

    this.socket.onopen = () => {
      if (this.closed || this.socketOpen) return;
      this.clearConnectTimer();
      this.socketOpen = true;
      Promise.all([this.send("Runtime.enable"), this.send("Page.enable")])
        .then(() => {
          if (this.closed) return;
          this.opened = true;
          const resolve = this.resolveOpen;
          this.resolveOpen = null;
          this.rejectOpen = null;
          resolve?.(this);
        })
        .catch((error) => {
          this.terminate(error);
          this.closeSocket();
        });
    };
    this.socket.onmessage = (event) => this.handleMessage(event);
    this.socket.onerror = (event) => {
      const source = event?.error;
      const detail =
        source instanceof Error
          ? source.message
          : typeof event?.message === "string" && event.message.length > 0
            ? event.message
            : "unknown socket error";
      this.terminate(
        new Error(`CDP WebSocket error: ${detail}`, {
          cause: source instanceof Error ? source : undefined,
        }),
      );
      this.closeSocket();
    };
    this.socket.onclose = (event) => {
      this.closeStarted = true;
      const code = Number.isInteger(event?.code) ? event.code : "unknown";
      const reason =
        typeof event?.reason === "string" && event.reason.length > 0
          ? `, reason: ${event.reason}`
          : "";
      this.terminate(new Error(`CDP WebSocket closed (code: ${code}${reason})`));
    };

    return this.openPromise;
  }

  send(method, params = {}, { timeoutMs = this.commandTimeoutMs } = {}) {
    if (this.closed) {
      return Promise.reject(this.terminalError ?? new Error("CDP session is closed"));
    }
    if (!this.socketOpen || !this.socket) {
      return Promise.reject(new Error("CDP session is not open"));
    }
    if (typeof method !== "string" || method.length === 0) {
      return Promise.reject(new TypeError("CDP method must be a non-empty string"));
    }

    try {
      validateDuration(timeoutMs, "timeoutMs", { allowZero: false });
    } catch (error) {
      return Promise.reject(error);
    }

    const id = this.nextRequestId;
    this.nextRequestId += 1;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });

      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(
          new Error(`failed to send CDP ${method}: ${errorMessage(error)}`, {
            cause: error,
          }),
        );
      }
    });
  }

  async evaluate(expression, { timeoutMs = this.commandTimeoutMs } = {}) {
    if (typeof expression !== "string") {
      throw new TypeError("Runtime.evaluate expression must be a string");
    }

    const response = await this.send(
      "Runtime.evaluate",
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
      },
      { timeoutMs },
    );

    if (response?.exceptionDetails) {
      throw buildEvaluationError(response.exceptionDetails);
    }
    if (response?.result?.type === "undefined") return undefined;
    return response?.result?.value;
  }

  close() {
    if (this.closeStarted) return;
    this.terminate(new Error("CDP session closed by client"));
    this.closeSocket();
  }

  handleMessage(event) {
    if (typeof event?.data !== "string") {
      this.terminate(new Error("received a non-text CDP WebSocket message"));
      this.closeSocket();
      return;
    }

    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      this.terminate(
        new Error(`received malformed CDP JSON: ${errorMessage(error)}`, {
          cause: error,
        }),
      );
      this.closeSocket();
      return;
    }

    if (!Number.isInteger(message?.id)) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;

    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) {
      pending.reject(buildCdpError(pending.method, message.error));
      return;
    }
    pending.resolve(message.result);
  }

  terminate(error) {
    if (this.terminalError) return;
    this.clearConnectTimer();
    this.terminalError = error;
    this.closed = true;
    this.socketOpen = false;

    const rejectOpen = this.rejectOpen;
    this.resolveOpen = null;
    this.rejectOpen = null;
    rejectOpen?.(error);

    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
  }

  clearConnectTimer() {
    if (this.connectTimer === null) return;
    clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  closeSocket() {
    if (this.closeStarted) return;
    this.closeStarted = true;
    if (!this.socket || typeof this.socket.close !== "function") return;

    const closing = this.WebSocketImpl.CLOSING ?? 2;
    const closed = this.WebSocketImpl.CLOSED ?? 3;
    if (this.socket.readyState === closing || this.socket.readyState === closed) return;
    this.socket.close();
  }
}
