import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import net from "node:net";

const DEFAULT_TIMEOUT_MS = 20000;
const OVERLAY_TIMEOUT_MS = 7000;
const SMOKE_TERM = "gnocchi";

export async function runLoadedExtensionSmoke(options = {}) {
  const root = resolve(options.root || process.cwd());
  const allowLaunch = options.allowLaunch ?? process.env.SAYTHIS_SMOKE_LAUNCH === "1";
  if (!allowLaunch) {
    return {
      skipped: true,
      reason: "Set SAYTHIS_SMOKE_LAUNCH=1 to launch a separate Chrome/Edge smoke profile."
    };
  }

  const executable = options.executable || findChromiumExecutable();
  if (!executable) {
    return {
      skipped: true,
      reason: "Set SAYTHIS_CHROME_PATH or install Chrome/Edge to run this smoke test."
    };
  }

  if (typeof WebSocket !== "function") {
    return {
      skipped: true,
      reason: "This Node runtime has no global WebSocket."
    };
  }

  const port = options.port || await freePort();
  const profileDir = await mkdtemp(join(tmpdir(), "saythis-chrome-"));
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const required = options.required ?? process.env.SAYTHIS_SMOKE_REQUIRED === "1";
  const closeLaunchedBrowser = options.closeLaunchedBrowser ?? process.env.SAYTHIS_SMOKE_CLOSE === "1";
  const child = spawn(executable, chromeArgs(root, profileDir, port, options), {
    stdio: "ignore"
  });
  let processExited = false;
  child.on("exit", () => {
    processExited = true;
  });

  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`, timeoutMs);
    let targets;
    try {
      targets = await waitForTargets(port, (items) => items.some(isSayThisServiceWorker), timeoutMs);
    } catch (error) {
      if (required) {
        throw error;
      }

      return {
        skipped: true,
        product: version.Browser || "",
        reason: "Extension target did not appear. Try SAYTHIS_SMOKE_HEADLESS=0 for a local visible run.",
        profileDir: closeLaunchedBrowser ? "" : profileDir
      };
    }

    const worker = targets.find(isSayThisServiceWorker);
    const extensionId = extensionIdFromUrl(worker.url);
    if (!extensionId) {
      throw new Error("Could not determine extension id.");
    }

    const popup = await inspectExtensionPage(port, extensionId, "src/popup.html");
    const optionsPage = await inspectExtensionPage(port, extensionId, "src/options.html");

    assertPage(popup, {
      title: "SayThis",
      selectors: ["#selection", "#resolve", "#speak", "#result-card"]
    });
    assertPage(optionsPage, {
      title: "SayThis Options",
      selectors: ["#online-default", "#custom-source-enabled", "#forvo-enabled", "#sync-enabled"]
    });

    const overlay = await inspectKeyboardOverlay(port, options);

    return {
      skipped: false,
      product: version.Browser || "",
      extensionId,
      serviceWorker: worker.url,
      pages: [popup.url, optionsPage.url],
      overlay,
      profileDir: closeLaunchedBrowser ? "" : profileDir
    };
  } finally {
    if (closeLaunchedBrowser) {
      child.kill();
      await delay(150);
      await rm(profileDir, { recursive: true, force: true });
    } else if (processExited || child.exitCode !== null) {
      await rm(profileDir, { recursive: true, force: true });
    } else {
      child.unref();
    }
  }
}

function chromeArgs(root, profileDir, port, options) {
  const headless = options.headless ?? process.env.SAYTHIS_SMOKE_HEADLESS !== "0";
  return [
    headless ? "--headless=new" : "",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    `--disable-extensions-except=${root}`,
    `--load-extension=${root}`,
    "about:blank"
  ].filter(Boolean);
}

function findChromiumExecutable() {
  const candidates = [
    process.env.SAYTHIS_CHROME_PATH,
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge"
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) || "";
}

function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
    server.on("error", rejectPort);
  });
}

async function waitForTargets(port, predicate, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const items = await fetchJson(`http://127.0.0.1:${port}/json/list`).catch(() => []);
    if (predicate(items)) {
      return items;
    }

    await delay(150);
  }

  throw new Error("Timed out waiting for extension targets.");
}

async function waitForJson(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await fetchJson(url);
    } catch {
      await delay(150);
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function inspectExtensionPage(port, extensionId, path) {
  const url = `chrome-extension://${extensionId}/${path}`;
  const target = await fetchJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT"
  });
  const client = await connectCdp(target.webSocketDebuggerUrl);
  try {
    await client.call("Runtime.enable");
    await waitForPageReady(client);
    const [title, selectors] = await Promise.all([
      client.evaluate("document.title"),
      client.evaluate("Array.from(document.querySelectorAll('[id]')).map((node) => `#${node.id}`)")
    ]);
    return {
      url,
      title,
      selectors
    };
  } finally {
    client.close();
  }
}

async function inspectKeyboardOverlay(port, options = {}) {
  const overlayRequired = options.overlayRequired ?? process.env.SAYTHIS_SMOKE_OVERLAY_REQUIRED === "1";
  const { server, url } = await startSmokePageServer();
  let client;

  try {
    const target = await fetchJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
      method: "PUT"
    });
    client = await connectCdp(target.webSocketDebuggerUrl);
    await client.call("Runtime.enable");
    await client.call("Page.enable");
    await client.call("Page.bringToFront");
    await waitForPageReady(client);

    const selected = await selectSmokeTerm(client);
    if (selected !== SMOKE_TERM) {
      throw new Error(`Expected smoke page selection ${SMOKE_TERM}, got ${selected || "empty"}.`);
    }

    await dispatchPronounceShortcut(client);
    const found = await waitForExpression(
      client,
      "Boolean(document.querySelector('saythis-overlay')?.shadowRoot?.textContent.includes('Gnocchi'))",
      OVERLAY_TIMEOUT_MS
    ).catch(() => false);

    if (!found) {
      const reason = "Keyboard overlay path did not complete in this Chrome mode.";
      if (overlayRequired) {
        throw new Error(reason);
      }

      return {
        skipped: true,
        reason,
        url
      };
    }

    const text = await client.evaluate("document.querySelector('saythis-overlay')?.shadowRoot?.textContent || ''");
    return {
      skipped: false,
      url,
      term: selected,
      text: compactText(text).slice(0, 240)
    };
  } finally {
    if (client) {
      client.close();
    }
    await closeServer(server);
  }
}

function startSmokePageServer() {
  return new Promise((resolveServer, rejectServer) => {
    const server = createServer((request, response) => {
      if (request.url !== "/") {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>SayThis Smoke Page</title>
  </head>
  <body>
    <main>
      <p id="term">${SMOKE_TERM}</p>
    </main>
  </body>
</html>`);
    });

    server.on("error", rejectServer);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveServer({
        server,
        url: `http://127.0.0.1:${address.port}/`
      });
    });
  });
}

function closeServer(server) {
  return new Promise((resolveClose) => {
    server.close(() => resolveClose());
  });
}

async function selectSmokeTerm(client) {
  return client.evaluate(`(() => {
    window.focus();
    const node = document.getElementById("term");
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  })()`);
}

async function dispatchPronounceShortcut(client) {
  await client.call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Alt",
    code: "AltLeft",
    windowsVirtualKeyCode: 18,
    nativeVirtualKeyCode: 18,
    modifiers: 1
  });
  await client.call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Shift",
    code: "ShiftLeft",
    windowsVirtualKeyCode: 16,
    nativeVirtualKeyCode: 16,
    modifiers: 9
  });
  await client.call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "S",
    code: "KeyS",
    windowsVirtualKeyCode: 83,
    nativeVirtualKeyCode: 83,
    modifiers: 9
  });
  await client.call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "S",
    code: "KeyS",
    windowsVirtualKeyCode: 83,
    nativeVirtualKeyCode: 83,
    modifiers: 9
  });
  await client.call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Shift",
    code: "ShiftLeft",
    windowsVirtualKeyCode: 16,
    nativeVirtualKeyCode: 16,
    modifiers: 1
  });
  await client.call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Alt",
    code: "AltLeft",
    windowsVirtualKeyCode: 18,
    nativeVirtualKeyCode: 18,
    modifiers: 0
  });
}

async function waitForExpression(client, expression, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await client.evaluate(expression)) {
      return true;
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for expression: ${expression}`);
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function waitForPageReady(client) {
  for (let index = 0; index < 100; index += 1) {
    const readyState = await client.evaluate("document.readyState");
    if (readyState === "complete" || readyState === "interactive") {
      return;
    }

    await delay(50);
  }

  throw new Error("Extension page did not become interactive.");
}

function assertPage(page, expected) {
  if (page.title !== expected.title) {
    throw new Error(`Expected ${page.url} title ${expected.title}, got ${page.title}.`);
  }

  for (const selector of expected.selectors) {
    if (!page.selectors.includes(selector)) {
      throw new Error(`Expected ${page.url} to include ${selector}.`);
    }
  }
}

function isSayThisServiceWorker(target) {
  return target?.type === "service_worker" && /chrome-extension:\/\/[^/]+\/src\/background\.js$/.test(target.url || "");
}

function extensionIdFromUrl(url) {
  return String(url || "").match(/^chrome-extension:\/\/([^/]+)\//)?.[1] || "";
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return response.json();
}

function connectCdp(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) {
      return;
    }

    const { resolve: resolveCall, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message || "CDP call failed."));
      return;
    }

    resolveCall(message.result || {});
  });

  const opened = new Promise((resolveOpen, rejectOpen) => {
    ws.addEventListener("open", resolveOpen, { once: true });
    ws.addEventListener("error", rejectOpen, { once: true });
  });

  return opened.then(() => ({
    call(method, params = {}) {
      id += 1;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolveCall, reject) => {
        pending.set(id, { resolve: resolveCall, reject });
      });
    },
    async evaluate(expression) {
      const result = await this.call("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || "Evaluation failed.");
      }

      return result.result?.value;
    },
    close() {
      ws.close();
    }
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runLoadedExtensionSmoke();
  if (result.skipped) {
    const profileStatus = result.profileDir
      ? `; close the smoke profile manually: ${result.profileDir}`
      : "";
    console.log(`skipped: ${result.reason}${profileStatus}`);
  } else {
    const overlayStatus = result.overlay?.skipped
      ? `; overlay skipped: ${result.overlay.reason}`
      : "; overlay ok";
    const profileStatus = result.profileDir
      ? `; close the smoke profile manually: ${result.profileDir}`
      : "";
    console.log(`loaded ${result.extensionId} in ${result.product}${overlayStatus}${profileStatus}`);
  }
}
