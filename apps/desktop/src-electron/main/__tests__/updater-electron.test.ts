// @vitest-environment node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { expect, it } from "vitest";

it.skipIf(process.platform !== "darwin")(
  "真实 Electron 隐藏窗口与 beforeunload 不阻断受控更新退出，保存失败仍可重试",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "tau-update-quit-"));
    const main = resolve(import.meta.dirname, "..");
    const output = join(root, "result.json");
    const fixture = join(root, "main.cjs");
    const stubs: Record<string, string> = {
      "electron-log": "export default { info(){}, warn(){}, error(){} };",
      "fs-extra/esm": "export default { async readJson(){ return { lastVersion: '0.60.0' }; } };",
      "electron-updater": "export default { get autoUpdater(){ return globalThis.updater; } };",
      [join(main, "utils/PathUtil")]: "export default { getAppDir(){ return globalThis.root; } };",
      [join(main, "modules/plugin-backend")]: `export const pluginBackends = {
      beginDrain(){ globalThis.order.push('drain'); }, async dispose(){}, forceDispose(){}
    }; export async function setPluginBackendsPaused(){}`,
      [join(main, "modules/collaboration")]: `export default { shutdown(){}, async prepareQuit(){
      globalThis.order.push('save');
      if(globalThis.failSave) throw Error('正文未确认保存');
      globalThis.order.push('saved');
    } };`,
      [join(main, "modules/mcp")]: "export default { async disconnectAll(){} };",
      [join(main, "services/content-execution")]: "export const contentExecutor = { dispose(){} };",
      [join(main, "windows/window-state")]:
        "export const initialBounds = (_key, size) => size; export const hasRememberedBounds = () => false; export function rememberBounds(){}",
      [join(main, "windows/create-window")]: `import { BrowserWindow } from 'electron';
      export const isContentRuntimeWindow = () => false;
      export const quitIfNoVisibleWindow = () => {};
      export const revealWindow = window => window.show();
      export function createWindow(){
        const win = new BrowserWindow({show:false, webPreferences:{preload:globalThis.preload, sandbox:false}});
        globalThis.loads.push(win.loadURL('data:text/html,<title>更新退出回归</title>'));
        win.on('closed', () => globalThis.order.push('closed'));
        return win;
      }`,
    };
    try {
      await writeFile(
        join(root, "preload.cjs"),
        `const {contextBridge,ipcRenderer} = require('electron');
      contextBridge.exposeInMainWorld('install', () => ipcRenderer.invoke('updater:install'));
      ipcRenderer.on('app:quitting', () => { void ipcRenderer.invoke('app:quitting-ready'); });`
      );
      await build({
        stdin: {
          resolveDir: main,
          contents: `
        const {app,BrowserWindow,autoUpdater:nativeUpdater} = require('electron');
        const {EventEmitter} = require('node:events');
        const {writeFileSync} = require('node:fs');
        const assert = require('node:assert/strict');
        globalThis.root = ${JSON.stringify(root)};
        globalThis.preload = ${JSON.stringify(join(root, "preload.cjs"))};
        globalThis.order = []; globalThis.loads = []; globalThis.failSave = true;
        Object.defineProperty(app, 'isPackaged', {get:()=>true});
        app.setPath('userData', ${JSON.stringify(join(root, "profile"))});
        app.on('window-all-closed', () => {});
        const timeout = setTimeout(() => app.exit(9), 15000);
        globalThis.updater = Object.assign(new EventEmitter(), { quitAndInstall(){
          assert.equal(BrowserWindow.getAllWindows().length,0);
          globalThis.order.push('install');
          for(const win of BrowserWindow.getAllWindows()) win.close();
          app.quit();
        }});
        const {setupQuitController,isAppQuitting} = require('./app-quit-controller');
        const {createWindow} = require('./windows/create-window');
        const {prepareFeedbackWindow} = require('./windows/utility-windows');
        const updater = require('./modules/updater').default;
        app.whenReady().then(async () => {
          setupQuitController({getTrayManager:()=>undefined});
          await updater.init();
          const mainWindow=createWindow();
          const feedback=prepareFeedbackWindow();
          await Promise.all(globalThis.loads);
          feedback.close();
          assert.equal(feedback.isDestroyed(),false);
          await mainWindow.webContents.executeJavaScript('window.onbeforeunload = () => false; void 0');
          globalThis.updater.emit('update-downloaded',{version:'0.61.0'});
          nativeUpdater.emit('update-downloaded');
          await assert.rejects(mainWindow.webContents.executeJavaScript('window.install()'),/正文未确认保存/);
          assert.equal(isAppQuitting(),false);
          assert.equal(BrowserWindow.getAllWindows().length,2);
          globalThis.failSave=false;
          app.on('before-quit', event => { assert.equal(event.defaultPrevented,false); globalThis.order.push('native-quit'); });
          app.on('quit', () => {
            clearTimeout(timeout);
            writeFileSync(${JSON.stringify(output)}, JSON.stringify(globalThis.order));
          });
          void mainWindow.webContents.executeJavaScript('window.install()').catch(()=>{});
        }).catch(error=>{console.error(error);app.exit(2);});
      `,
        },
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: fixture,
        external: ["electron"],
        packages: "external",
        plugins: [
          {
            name: "isolated-app-services",
            setup(builder) {
              builder.onResolve({ filter: /.*/ }, args => {
                const key = args.path.startsWith(".")
                  ? resolve(args.resolveDir, args.path)
                  : args.path;
                if (stubs[key]) return { path: key, namespace: "fixture-service" };
              });
              builder.onLoad({ filter: /.*/, namespace: "fixture-service" }, args => ({
                contents: stubs[args.path],
                loader: "js",
              }));
            },
          },
        ],
      });
      const executable = createRequire(import.meta.url)("electron") as string;
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      const result = await new Promise<{ code: number | null; logs: string }>(
        (resolveResult, reject) => {
          const child = spawn(executable, [fixture], { env, stdio: ["ignore", "pipe", "pipe"] });
          let logs = "";
          child.stdout.on("data", chunk => {
            logs += chunk;
          });
          child.stderr.on("data", chunk => {
            logs += chunk;
          });
          const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error(`隔离 Electron 未退出：${logs}`));
          }, 20000);
          child.on("error", error => {
            clearTimeout(timer);
            reject(error);
          });
          child.on("close", code => {
            clearTimeout(timer);
            resolveResult({ code, logs });
          });
        }
      );
      expect(result.code, result.logs).toBe(0);
      expect(JSON.parse(await readFile(output, "utf8"))).toEqual([
        "save",
        "save",
        "saved",
        "drain",
        "closed",
        "closed",
        "install",
        "native-quit",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  30000
);
