import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(desktop, "package.json"));
const builder = createRequire(require.resolve("electron-builder/package.json"));
const applicationBuilder = createRequire(builder.resolve("app-builder-lib/package.json"));
const asar = applicationBuilder("@electron/asar");
const packaged = join(desktop, "release/win-unpacked");
const executable = process.platform === "win32" ? join(packaged, "Tau.exe") : require("electron");
const originalArchive = join(packaged, "resources/app.asar");
if (!existsSync(executable) || !existsSync(originalArchive))
  throw new Error("需要已有 Windows unpacked 运行时验证 ASAR 原生线程");
const directory = await mkdtemp(join(tmpdir(), "tau-insight-asar-"));
try {
  const stage = join(directory, "stage");
  await mkdir(join(stage, "main"), { recursive: true });
  await cp(join(desktop, "dist-electron/main"), join(stage, "main"), { recursive: true });
  const archive = join(directory, "probe.asar");
  await asar.createPackage(stage, archive);
  const script = join(directory, "probe.cjs");
  await writeFile(
    script,
    `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { join } = require('node:path');
const { Worker } = require('node:worker_threads');
const original = ${JSON.stringify(originalArchive)};
const Database = require(original + '/node_modules/better-sqlite3');
const vec = require(original + '/node_modules/sqlite-vec');
const extension = vec.getLoadablePath().replace(/([\\\\/])app\\.asar([\\\\/])/, '$1app.asar.unpacked$2');
assert(fs.existsSync(extension));
const file = ${JSON.stringify(join(directory, "index.db"))};
const db = new Database(file); db.loadExtension(extension); db.pragma('journal_mode=WAL');
db.exec("CREATE TABLE vec_index_meta(key TEXT PRIMARY KEY,value TEXT); INSERT INTO vec_index_meta VALUES ('main_content_embedding_fingerprint','probe'); CREATE TABLE index_meta(key TEXT PRIMARY KEY,value TEXT,updated_at REAL); CREATE TABLE content_sections(prefixed_id TEXT,update_time REAL,chunk_index INTEGER,heading_path TEXT,block_start INTEGER,text TEXT); CREATE VIRTUAL TABLE vec_documents USING vec0(prefixed_id TEXT,update_time FLOAT,content TEXT,type TEXT,chunk_index INTEGER,vec_embedding FLOAT[4] distance_metric=cosine)");
const add=db.prepare("INSERT INTO vec_documents(prefixed_id,update_time,content,type,chunk_index,vec_embedding) VALUES (?,1.0,'probe',?,0,vec_f32(?))");
add.run('card:1','card','[1,0,0,0]');
add.run('chat-prompt:probe#one','chat-prompt','[0,0,1,0]');
add.run('chat-prompt:probe#two','chat-prompt','[0,0,1,0]');
const source={file,fingerprint:'probe',schemaVersion:Number(db.pragma('schema_version',{simple:true}))};
const worker=new Worker(${JSON.stringify(join(archive, "main/topic-insights-candidate-worker.js"))},{workerData:{source,task:{kind:'global',topics:[],links:[],concepts:[],threshold:0.8,longDocs:[]},cancel:new SharedArrayBuffer(4),extensionPath:extension,sqliteModulePath:require.resolve(original+'/node_modules/better-sqlite3')}});
let result, failure;
const timer=setTimeout(()=>{ console.error('ASAR worker timed out'); process.exit(1); },30000);
worker.on('message',value=>{if (!('phase' in value)) result=value;});
worker.on('error',error=>{failure=error;});
worker.on('exit',code=>{
  clearTimeout(timer);
  try { if(failure) throw failure; assert.equal(code,0); assert.equal(result?.ok,true,result?.message); assert.equal(result.result.asked.length,1); assert.equal(result.result.asked[0].times,2); db.close(); console.log('INSIGHT_ASAR_WORKER_OK'); }
  catch(error){ console.error(error); process.exitCode=1; }
});
`
  );
  const output = execFileSync(executable, [script], {
    encoding: "utf8",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    timeout: 45000,
    windowsHide: true,
  });
  if (!output.includes("INSIGHT_ASAR_WORKER_OK")) throw new Error(output);
  console.log(output.trim());
} finally {
  await rm(directory, { recursive: true, force: true });
}
