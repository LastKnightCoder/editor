import { mkdtemp, writeFile, rm, readdir, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { build, createServer } from "vite";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = resolve(desktop, "../../packages/shared/src/query-database/client.ts");
const oom = process.env.TAU_QUERY_STRESS_OOM === "1";
const modes = process.env.TAU_QUERY_RUNTIME_MODE
  ? [process.env.TAU_QUERY_RUNTIME_MODE]
  : ["development", "production"];
if (modes.some(mode => !["development", "production"].includes(mode)))
  throw new Error("查询运行验证模式无效");

async function verifyRuntime(mode) {
  const scratch = await mkdtemp(join(tmpdir(), "tau-query-runtime-"));
  let server;
  try {
    await symlink(
      join(desktop, "node_modules"),
      join(scratch, "node_modules"),
      process.platform === "win32" ? "junction" : "dir"
    );
    await writeFile(
      join(scratch, "index.html"),
      '<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="/main.js"></script></body></html>'
    );
    await writeFile(
      join(scratch, "main.js"),
      `
import { startQuery } from ${JSON.stringify(client)};
window.verifyQueryRuntime = async () => {
  const context = { now: 1000, today: '2026-11-25', timeZone: 'Asia/Shanghai', params: {} };
  const card = (id,title,tags,wordCount) => ({id,title,tags,wordCount,createdAt:1,updatedAt:1000,source:{kind:'card',id:id.slice(5),title}});
  const rows = [card('card:1','读书卡片',['读书'],100),card('card:2','其他',['工作'],200)];
  let reads = 0;
  const read = async () => { reads++; return {items:rows}; };
  const waitClean = async () => {
    for(let index=0;index<200 && document.querySelector('iframe');index++)
      await new Promise(resolve=>setTimeout(resolve,10));
    if(document.querySelector('iframe')) throw new Error('Execution frame was not released');
  };
  const definition = {version:1,language:'dsl',code:'TABLE title, wordCount TYPE number FROM cards WHERE hasTag("读书")'};
  const first = await startQuery({definition,context,read}).result;
  if(first.rows.length !== 1 || first.rows[0].values.title !== '读书卡片') throw new Error('DSL result mismatch');
  rows.push(card('card:3','新卡片',['读书'],50));
  const refreshed = await startQuery({definition,context,read}).result;
  if(refreshed.rows.length !== 2) throw new Error('Full refresh did not read new data');
  const javascript = await startQuery({definition:{version:1,language:'javascript',code:'const cards=await data.cards.collect(); return {columns:[{key:"n",title:"数量",type:"number"}],rows:[{id:"total",values:{n:cards.length}}]};'},context,read}).result;
  if(javascript.rows[0].values.n !== 3) throw new Error('JavaScript RPC result mismatch');
  const migrated=await startQuery({definition:{version:1,language:'dsl',code:'TABLE title AS "开头", tags AS "标签", createdAt AS "创建时间", updatedAt AS "更新时间", wordCount AS "字数", source AS "来源" FROM cards'},context,read}).result;
  if(migrated.rows.length !== 3 || migrated.columns.find(column=>column.key==='createdAt')?.type !== 'date' || migrated.rows[0].values.createdAt !== 1 || migrated.rows[0].values.source.id !== '1') throw new Error('Migrated card query mismatch');
  let networkBlocked = false;
  try { await startQuery({definition:{version:1,language:'javascript',code:'await fetch("https://example.com");'},context,read}).result; } catch { networkBlocked = true; }
  if(!networkBlocked) throw new Error('Network request was allowed');
  const beforeLoop = reads;
  let terminated = false;
  try { await startQuery({definition:{version:1,language:'javascript',code:'await data.cards.collect(); while(true) {}'},context,read,timeoutMs:2000}).result; } catch(error) { terminated=String(error).includes('超时'); }
  if(!terminated || reads <= beforeLoop) throw new Error('Executing loop was not terminated');
  await waitClean();
  const afterFailure=await startQuery({definition,context,read}).result;
  if(afterFailure.rows.length !== 2) throw new Error('Runtime did not recover after timeout');
  let oomRecovery = 0;
  ${
    oom
      ? `for(let index=0;index<2;index++) {
    let rejected=false;
    try { await startQuery({definition:{version:1,language:'javascript',code:'const arrays=[];while(true) arrays.push(new Array(1000000).fill(1));'},context,read,timeoutMs:5000}).result; } catch { rejected=true; }
    if(!rejected) throw new Error('Memory exhaustion was not rejected');
    const recovered=await startQuery({definition:{version:1,language:'javascript',code:'return {columns:[{key:"ok",title:"ok",type:"boolean"}],rows:[{id:"recovered",values:{ok:true}}]};'},context,read}).result;
    if(!recovered.rows[0].values.ok) throw new Error('Runtime did not recover after memory exhaustion');
    oomRecovery++;
  }`
      : ""
  }
  await waitClean();
  return {mode:${JSON.stringify(mode)},dsl:true,migratedDsl:true,javascript:true,fullRefresh:true,networkBlocked,timeoutTerminated:terminated,cleanup:true,retryRecovered:true,oomRecovery};
};`
    );
    let destination;
    if (mode === "development") {
      server = await createServer({
        configFile: join(desktop, "vite.config.mts"),
        configLoader: "runner",
        mode: "whiteboard-benchmark",
        root: scratch,
        cacheDir: join(scratch, "vite-cache"),
        logLevel: "warn",
        optimizeDeps: { noDiscovery: true, include: [], entries: [] },
        server: { host: "127.0.0.1", port: 0, fs: { allow: [scratch, resolve(desktop, "../..")] } },
      });
      await server.listen();
      destination = server.resolvedUrls.local[0];
    } else {
      await build({
        configFile: join(desktop, "vite.config.mts"),
        configLoader: "runner",
        mode: "whiteboard-benchmark",
        root: scratch,
        base: "./",
        logLevel: "warn",
        build: {
          outDir: "dist",
          emptyOutDir: true,
          rolldownOptions: { input: join(scratch, "index.html") },
        },
      });
    }
    await writeFile(
      join(scratch, "electron.cjs"),
      `
const {app,BrowserWindow}=require('electron');
const path=require('node:path');
app.setPath('userData',path.join(__dirname,'profile'));
app.commandLine.appendSwitch('disable-gpu');
${oom ? "app.commandLine.appendSwitch('js-flags','--max-old-space-size=128');" : ""}
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
 window.webContents.on('console-message',({level,message})=>{if(level==='error')process.stderr.write(message+'\\n');});
 window.webContents.on('did-finish-load',()=>process.stderr.write('query-runtime: page loaded\\n'));
 window.webContents.on('render-process-gone',(_,details)=>process.stderr.write('query-runtime: renderer '+details.reason+'\\n'));
 try {
  ${destination ? `await window.loadURL(${JSON.stringify(destination)});` : "await window.loadFile(path.join(__dirname,'dist/index.html'));"}
  const result=await window.webContents.executeJavaScript('window.verifyQueryRuntime()');
  process.stdout.write(JSON.stringify(result)+'\\n'); window.destroy(); app.exit(0);
 } catch(error) { process.stderr.write(String(error)+'\\n'); window.destroy(); app.exit(1); }
});
setTimeout(()=>app.exit(2),30000);`
    );
    const electron = createRequire(import.meta.url)("electron");
    await new Promise((resolveRun, reject) => {
      const child = spawn(electron, [join(scratch, "electron.cjs")], {
        stdio: "inherit",
        env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
        timeout: 40_000,
      });
      child.once("error", reject);
      child.once("exit", code =>
        code === 0 ? resolveRun() : reject(new Error(`查询运行验证失败：${code}`))
      );
    });
    const assets = join(scratch, "dist/assets");
    if (mode === "production")
      for (const name of await readdir(assets))
        if (name.startsWith("worker-") && name.endsWith(".js"))
          console.log(`query-worker: ${(await stat(join(assets, name))).size} bytes`);
  } finally {
    await server?.close();
    await rm(scratch, { recursive: true, force: true });
  }
}

for (const mode of modes) await verifyRuntime(mode);
