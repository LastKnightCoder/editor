import { app, BrowserWindow, ipcMain } from "electron";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { PluginUpdates } from "../../src-electron/main/services/plugin-updates";
import { LocalPluginPreferences } from "@tau/plugins/local-state";
import { PluginContentStartup } from "../../src-electron/main/services/plugin-content-startup";
import { readPluginPackage } from "../../src-electron/main/services/plugin-package";
import { discoverPlugins } from "../../src-electron/main/services/plugin-discovery";
import { acceptHeadlessPlugin } from "../../src-electron/main/services/plugin-codecs";
import { verifyStickman } from "./stickman";
const root = process.env.TAU_WHITEBOARD_VERIFY_ROOT!;
const zip = process.env.TAU_WHITEBOARD_VERIFY_ZIP!;
const phase = process.env.TAU_WHITEBOARD_VERIFY_PHASE!;
const id = process.env.TAU_WHITEBOARD_VERIFY_ID ?? "example.whiteboard-probe";
const directory = path.join(root, "plugins");
app.setPath("userData", path.join(root, "profile"));

async function verify() {
  await app.whenReady();
  app.dock?.hide();
  await mkdir(directory, { recursive: true });
  const updates = new PluginUpdates(directory, "0.59.0");
  await updates.initialize();
  if (phase === "initial") {
    const bytes = await readFile(zip);
    const AdmZip = (await import("adm-zip")).default;
    const archive = new AdmZip(bytes);
    const manifest = JSON.parse(archive.readAsText(id + "/manifest.json"));
    await updates.stageRelease(bytes, {
      kind: "center",
      pluginId: id,
      version: manifest.version,
      releaseId: "test-release",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    await updates.initialize();
  }
  const prefs = new LocalPluginPreferences(directory);
  await prefs.load();
  if (phase === "initial" || phase === "missing" || phase === "restored") await prefs.set(id, true);
  if (phase === "disabled") await prefs.set(id, false);
  if (phase === "missing")
    await rename(path.join(directory, id), path.join(root, "removed-package"));
  if (phase === "restored")
    await rename(path.join(root, "removed-package"), path.join(directory, id));
  const startup = new PluginContentStartup(async pluginId => {
    const artifact = await readPluginPackage(path.join(directory, pluginId), "0.59.0");
    acceptHeadlessPlugin(artifact);
    return artifact;
  });
  const snapshot = await startup.get(prefs.enabled(id, false) ? [id] : []);
  ipcMain.handle("module-init:init-module", () => ({ success: true }));
  ipcMain.handle("get-home-dir", () => root);
  ipcMain.handle("get-all-white-boards", () => []);
  ipcMain.handle("plugin-local:content-startup", () => snapshot);
  ipcMain.handle("plugin-local:scan", async () => {
    const scan = await discoverPlugins(directory, "0.59.0");
    return {
      ...scan,
      entries: scan.entries.map(entry => ({
        ...entry,
        enabled: prefs.enabled(entry.id, false),
      })),
    };
  });
  const savedPath = path.join(root, "board.json");
  ipcMain.handle("verification:load", async () =>
    JSON.parse(await readFile(savedPath, "utf8").catch(() => "[]"))
  );
  ipcMain.handle("verification:id", () => id);
  ipcMain.handle("verification:save", async (_event, nodes) =>
    writeFile(savedPath, JSON.stringify(nodes))
  );
  const window = new BrowserWindow({
    show: false,
    width: 1100,
    height: 760,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(root, "preload.cjs"),
    },
  });
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) console.error(message);
  });
  await window.loadFile(path.join(root, "index.html"));
  const run = (code: string) => window.webContents.executeJavaScript(code);
  const wait = async (condition: string) => {
    const until = Date.now() + 30000;
    while (!(await run(condition))) {
      const error = await run("document.body.dataset.error");
      if (error) throw new Error(error);
      if (Date.now() > until) throw new Error(`等待超时：${condition}`);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  };
  await wait("window.whiteboardTest?.ready()");
  let details: unknown;
  if (id === "taunote.stickman") {
    details = await verifyStickman(window, run, wait, phase, savedPath);
  } else if (phase === "initial") {
    await run("window.whiteboardTest.tool('example.whiteboard-probe.create')");
    window.webContents.sendInputEvent({
      type: "mouseDown",
      x: 300,
      y: 220,
      button: "left",
      clickCount: 1,
    });
    window.webContents.sendInputEvent({
      type: "mouseUp",
      x: 300,
      y: 220,
      button: "left",
      clickCount: 1,
    });
    await wait("document.querySelector('[data-whiteboard-probe]') !== null");
    const node = (await run("window.whiteboardTest.snapshot().children"))[0];
    assert.equal(node.type, "example.whiteboard-probe.box");
    await run(`window.whiteboardTest.select(${JSON.stringify(node.id)})`);
    await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='修改验证文字')");
    await run(
      "[...document.querySelectorAll('button')].find(b=>b.textContent==='修改验证文字').click()"
    );
    await wait("window.whiteboardTest.snapshot().children[0].data.label==='已编辑'");
    await run("window.whiteboardTest.execute('tau.history.undo')");
    assert.equal(await run("window.whiteboardTest.snapshot().children[0].data.label"), "白板插件");
    await run("window.whiteboardTest.execute('tau.history.redo')");
    assert.equal(await run("window.whiteboardTest.snapshot().children[0].data.label"), "已编辑");
    await wait("document.querySelectorAll('[data-resize-handle]').length===4");
    const handle = await run(
      "(() => { const r = document.querySelector('[data-resize-handle=\"bottom-right\"] circle').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()"
    );
    const beforeResize = await run("window.whiteboardTest.snapshot().children[0]");
    window.webContents.sendInputEvent({
      type: "mouseDown",
      x: Math.round(handle.x),
      y: Math.round(handle.y),
      button: "left",
      clickCount: 1,
    });
    window.webContents.sendInputEvent({
      type: "mouseMove",
      x: Math.round(handle.x + 80),
      y: Math.round(handle.y + 40),
      button: "left",
    });
    window.webContents.sendInputEvent({
      type: "mouseUp",
      x: Math.round(handle.x + 80),
      y: Math.round(handle.y + 40),
      button: "left",
      clickCount: 1,
    });
    await wait(`window.whiteboardTest.snapshot().children[0].width > ${beforeResize.width}`);
    await run("window.whiteboardTest.execute('tau.history.undo')");
    assert.equal(
      await run("window.whiteboardTest.snapshot().children[0].width"),
      beforeResize.width
    );
    await run("window.whiteboardTest.execute('tau.history.redo')");
    await run("window.whiteboardTest.sketch()");
    await wait(
      "document.querySelector('[data-probe-sketch]')?.getAttribute('data-probe-sketch')==='true'"
    );
    await wait(
      "document.querySelector('#standalone-schematic rect')?.getAttribute('fill')==='var(--tau-accent)'"
    );
    const copied = await run(`(() => {
      const board = document.querySelector('[data-whiteboard-root]');
      board.focus();
      const clipboardData = new DataTransfer();
      board.dispatchEvent(new ClipboardEvent('copy', { bubbles:true, cancelable:true, clipboardData }));
      const payload = clipboardData.getData('application/json');
      board.dispatchEvent(new ClipboardEvent('paste', { bubbles:true, cancelable:true, clipboardData }));
      return JSON.parse(payload);
    })()`);
    assert.equal(copied.elements[0].type, node.type);
    await wait("window.whiteboardTest.snapshot().children.length === 2");
    const duplicated = await run("window.whiteboardTest.snapshot().children");
    assert.notEqual(duplicated[0].id, duplicated[1].id);
    assert.deepEqual(duplicated[0].data, duplicated[1].data);
    assert.equal(
      await run(`window.whiteboardTest.update(${JSON.stringify(node.id)}, {x:420})`),
      true
    );
    await run("window.whiteboardTest.readonly(true)");
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(
      await run(`window.whiteboardTest.update(${JSON.stringify(node.id)}, {x:0})`),
      false
    );
    assert.equal(await run("window.whiteboardTest.snapshot().children[0].x"), 420);
    await run("window.whiteboardTest.save()");
  } else {
    const expected = JSON.parse(await readFile(savedPath, "utf8"));
    assert.deepEqual(await run("window.whiteboardTest.snapshot().children"), expected);
    const missing = phase === "disabled" || phase === "missing";
    await wait(
      missing
        ? "Boolean(document.querySelector('[data-unknown-element]'))"
        : "Boolean(document.querySelector('[data-whiteboard-probe]'))"
    );
    assert.equal(await run("Boolean(document.querySelector('[data-whiteboard-probe]'))"), !missing);
    await run("window.whiteboardTest.save()");
    assert.deepEqual(JSON.parse(await readFile(savedPath, "utf8")), expected);
  }
  await writeFile(
    path.join(root, `${phase}.json`),
    JSON.stringify({ phase, passed: true, details })
  );
  window.destroy();
  app.exit(0);
}
void verify().catch(error => {
  console.error(error);
  app.exit(1);
});
