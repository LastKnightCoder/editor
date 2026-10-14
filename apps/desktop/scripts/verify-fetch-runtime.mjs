import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = await mkdtemp(path.join(tmpdir(), "tau-fetch-runtime-"));
try {
  await Promise.all([
    build({
      entryPoints: [path.join(root, "src-electron/main/modules/fetch.ts")],
      outfile: path.join(directory, "service.cjs"),
      bundle: true,
      platform: "node",
      external: ["electron"],
    }),
    build({
      entryPoints: [path.join(root, "src-electron/preload/index.ts")],
      outfile: path.join(directory, "preload.cjs"),
      bundle: true,
      platform: "node",
      external: ["electron"],
    }),
    build({
      entryPoints: [path.join(root, "src/commands/fetch.ts")],
      outfile: path.join(directory, "renderer.js"),
      bundle: true,
      platform: "browser",
      format: "iife",
      globalName: "FetchApi",
      tsconfig: path.join(root, "tsconfig.json"),
    }),
  ]);
  await writeFile(
    path.join(directory, "main.cjs"),
    `
const {app,BrowserWindow,ipcMain}=require('electron');
const {createServer}=require('node:http');
const {readFileSync}=require('node:fs');
const path=require('node:path');
app.setPath('userData',path.join(__dirname,'profile'));
app.whenReady().then(async()=>{
  app.dock?.hide();
  await require('./service.cjs').default.init();
  ipcMain.handle('module-init:init-module',()=>({success:true}));
  let release;
  const server=createServer(async(req,res)=>{
    if(req.url==='/stream'){res.writeHead(200,{'Content-Type':'text/plain'});res.write('first');release=()=>res.end('last');return;}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    res.setHeader('Content-Type','application/json');res.setHeader('Set-Cookie',['a=1','b=2']);
    res.end(JSON.stringify({cookie:req.headers.cookie,referer:req.headers.referer,type:req.headers['content-type'],body:Buffer.concat(chunks).toString('base64')}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,preload:path.join(__dirname,'preload.cjs')}});
  await win.loadURL('about:blank');
  await win.webContents.executeJavaScript(readFileSync(path.join(__dirname,'renderer.js'),'utf8'));
  const result=await win.webContents.executeJavaScript('(async()=>{const form=new FormData();form.append("name","中文");form.append("file",new Blob([new Uint8Array([0,1,255])]),"fixture.bin");const response=await FetchApi.desktopFetch('+JSON.stringify(url) + ',{method:"POST",headers:{Cookie:"fixture=1",Referer:"https://example.test"},body:form});const clone=response.clone();const value=await response.json();const parsed=await new Response(Uint8Array.from(atob(value.body),c=>c.charCodeAt(0)),{headers:{"Content-Type":value.type}}).formData();return {cookie:value.cookie,referer:value.referer,cookies:response.headers.getSetCookie(),cloneUrl:clone.url,cloneCookie:(await clone.json()).cookie,name:parsed.get("name"),bytes:[...new Uint8Array(await parsed.get("file").arrayBuffer())]};})()');
  if(result.cookie!=='fixture=1'||result.referer!=='https://example.test'||result.cookies.length!==2||result.cloneCookie!=='fixture=1'||result.cloneUrl!==url+'/'||result.name!=='中文'||JSON.stringify(result.bytes)!=='[0,1,255]')throw new Error('Electron fetch metadata/body mismatch: '+JSON.stringify(result));
  await win.webContents.executeJavaScript('(async()=>{globalThis.abort=new AbortController();globalThis.response=await FetchApi.desktopFetch('+JSON.stringify(url+'/stream')+',{signal:abort.signal});globalThis.reader=response.body.getReader();const chunk=await reader.read();if(new TextDecoder().decode(chunk.value)!=="first")throw new Error("stream first chunk missing");})()');
  const aborted=await win.webContents.executeJavaScript('(async()=>{abort.abort("runtime-stop");try{await reader.read();return false;}catch(error){return error==="runtime-stop";}})()');
  if(!aborted)throw new Error('Electron fetch abort mismatch');
  release?.();win.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  console.log('[fetch-runtime] Cookie/Set-Cookie, FormData, binary, clone, response stream and abort passed');
  app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
`
  );
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const electron = createRequire(path.join(root, "package.json"))("electron");
  const code = await new Promise((resolve, reject) => {
    const child = spawn(electron, [path.join(directory, "main.cjs")], {
      env: environment,
      stdio: "inherit",
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Electron fetch 验证超时"));
    }, 30000);
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", code => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  if (code !== 0) throw new Error(`Electron fetch 验证失败：${code}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
