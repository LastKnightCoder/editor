import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.TAU_PERF_BENCH !== "1") {
  console.log("运行 pnpm --filter desktop test:perf-cpu 启用真实采样验证。");
  process.exit(0);
}
const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), "tau-cpu-native-"));
try {
  if (process.argv.includes("--production")) {
    await writeFile(
      path.join(temporary, "perf-cpu-worker.js"),
      `require(${JSON.stringify(path.join(root, "dist-electron/main/perf-cpu-worker.js"))});`
    );
  } else
    await build({
      entryPoints: [path.join(root, "src-electron/main/workers/perf-cpu.worker.ts")],
      outfile: path.join(temporary, "perf-cpu-worker.js"),
      bundle: true,
      platform: "node",
      format: "cjs",
    });
  await build({
    entryPoints: [path.join(root, "src-electron/main/services/perf-cpu-capture.ts")],
    outfile: path.join(temporary, "capture.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
  });
  const fixture = `function cpuFixtureHotLoop(duration) {
    const end = Date.now() + duration; let value = 1;
    while (Date.now() < end) value = Math.sqrt(value + Math.random());
    return value;
  }
  if (typeof module !== 'undefined') module.exports = cpuFixtureHotLoop;
  else window.cpuFixtureHotLoop = cpuFixtureHotLoop;`;
  await mkdir(path.join(temporary, "dist-electron/main"), { recursive: true });
  await mkdir(path.join(temporary, "dist/assets"), { recursive: true });
  await writeFile(path.join(temporary, "dist-electron/main/fixture.cjs"), fixture);
  await writeFile(path.join(temporary, "dist/assets/fixture.js"), fixture);
  await writeFile(
    path.join(temporary, "dist/index.html"),
    '<script src="assets/fixture.js"></script>'
  );
  await writeFile(
    path.join(temporary, "main.cjs"),
    `
    const assert = require('node:assert/strict');
    const path = require('node:path');
    const { Worker } = require('node:worker_threads');
    const inspector = require('node:inspector');
    const { app, BrowserWindow } = require('electron');
    const { captureCpu } = require('./capture.cjs');
    app.setPath('userData', path.join(__dirname, 'profile'));
    app.on('window-all-closed', () => undefined);
    app.whenReady().then(async () => {
      const worker = new Worker(path.join(__dirname, 'perf-cpu-worker.js'), { workerData: { appRoot: __dirname } });
      let started;
      const ready = new Promise(resolve => { started = resolve; });
      const completed = new Promise((resolve, reject) => {
        worker.on('message', message => {
          if (message.type === 'started') started();
          else if (message.type === 'complete') resolve(message.result);
          else reject(new Error('main-profile-failed'));
        });
        worker.on('error', reject);
      });
      await ready;
      require('./dist-electron/main/fixture.cjs')(6000);
      const main = await completed;
      await worker.terminate();
      assert(main.actualDurationMs < 5800, '主线程阻塞不能推迟 worker 采样停止');
      assert(main.summary.top.some(row => row.frame.functionName === 'cpuFixtureHotLoop'), '主进程热点缺失');
      assert.equal(inspector.url(), undefined, '不应打开调试端口');
      const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
      await win.loadFile(path.join(__dirname, 'dist/index.html'));
      const source = { pid: win.webContents.getOSProcessId(), type: 'renderer', webContentsId: win.webContents.id };
      win.webContents.debugger.attach('1.3');
      await assert.rejects(captureCpu(source, new AbortController().signal), /debugger-busy/);
      assert(win.webContents.debugger.isAttached(), '不得释放其他调试会话');
      win.webContents.debugger.detach();
      const pending = captureCpu(source, new AbortController().signal);
      const work = win.webContents.executeJavaScript('new Promise(resolve => setTimeout(() => resolve(cpuFixtureHotLoop(6000)), 100))');
      const renderer = await pending;
      await work;
      assert(renderer.summary.top.some(row => row.frame.functionName === 'cpuFixtureHotLoop'), '渲染进程热点缺失');
      assert(!win.webContents.debugger.isAttached(), '采样后未释放调试会话');
      assert(!JSON.stringify(renderer).includes(__dirname), '采样泄漏机器路径');
      const controller = new AbortController();
      const cancel = captureCpu(source, controller.signal);
      setTimeout(() => controller.abort(), 100);
      await assert.rejects(cancel, /cancelled/);
      assert(!win.webContents.debugger.isAttached(), '取消后未释放调试会话');
      console.log(JSON.stringify({ mainMs: main.actualDurationMs, rendererMs: renderer.actualDurationMs,
        mainSamples: main.summary.samples, rendererSamples: renderer.summary.samples }));
      console.log('[perf-cpu] 真实主/渲染采样、阻塞期间停止、调试占用、取消与路径清理通过');
      win.destroy(); app.exit(0);
    }).catch(error => { console.error(error); app.exit(1); });
  `
  );
  const executable = createRequire(path.join(root, "package.json"))("electron");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [path.join(temporary, "main.cjs")], { env, stdio: "inherit" });
    const timeout = setTimeout(() => child.kill(), 40_000);
    child.once("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", code => {
      clearTimeout(timeout);
      code === 0 ? resolve() : reject(new Error(`CPU 验证失败：${code}`));
    });
  });
} finally {
  await rm(temporary, { recursive: true, force: true });
}
