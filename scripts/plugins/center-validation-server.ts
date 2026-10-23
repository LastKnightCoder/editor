import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import AdmZip from "../../apps/plugin-portal/node_modules/adm-zip";
import { testEnvironment } from "../../apps/plugin-portal/api/testing";
import { handle } from "../../apps/plugin-portal/api/index";
import { inspectPackage } from "../../apps/plugin-portal/api/package";

const root = path.resolve(process.argv[2] ?? ".");
const output = path.join(root, "output/plugin-center-validation");
const origin = "http://127.0.0.1:8787";
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
let fixture = testEnvironment({
  migrationsRoot: pathToFileURL(path.join(root, "apps/plugin-portal/infra/migrations/")),
});
let releases = new Map<
  string,
  { submissionId: string; releaseId: string; bytes: Buffer; sha256: string; objectKey: string }
>();
let slow = new Set<string>();
const sources = JSON.parse(
  await readFile(path.join(root, "output/plugin-portability-validation/sources.json"), "utf8")
);
const counterSource = sources.find(
  (source: { id: string }) => source.id === "example.external-counter"
);
if (!counterSource) throw new Error("缺少计数器验证产物");
const codeArchive = await readFile(
  path.join(
    root,
    "output/plugin-portability-validation",
    path.basename(new URL(counterSource.url).pathname)
  )
);
if (hash(codeArchive) !== counterSource.sha256) throw new Error("计数器验证产物摘要不匹配");

function counter(version: string) {
  const zip = new AdmZip(codeArchive);
  const prefix = "example.external-counter/";
  const manifest = JSON.parse(zip.readAsText(prefix + "manifest.json"));
  let code = zip.readAsText(prefix + "main.js");
  if (version !== manifest.version) {
    const marker = `version: "${manifest.version}"`;
    if (code.split(marker).length !== 2) throw new Error("计数器编译元数据不唯一");
    code = code.replace(marker, `version: "${version}"`);
  }
  manifest.version = version;
  manifest.integrity[manifest.main] = hash(code);
  zip.updateFile(prefix + "manifest.json", Buffer.from(JSON.stringify(manifest)));
  zip.updateFile(prefix + "main.js", Buffer.from(code));
  for (const entry of zip.getEntries()) entry.header.time = new Date(1980, 0, 1);
  return zip.toBuffer();
}
async function abc() {
  const source = new AdmZip(
    await readFile(path.join(root, "output/plugin-portability-validation/tau.abc-0.1.0.zip"))
  );
  const zip = new AdmZip();
  for (const entry of source.getEntries())
    if (!entry.isDirectory) zip.addFile(`tau.abc/${entry.entryName}`, entry.getData());
  zip.addFile("tau.abc/README.md", Buffer.from("# ABC 乐谱\n本机中心模拟器联调夹具。"));
  for (const entry of zip.getEntries()) entry.header.time = new Date(1980, 0, 1);
  return zip.toBuffer();
}
async function publish(bytes: Buffer) {
  const content = await inspectPackage(bytes);
  const manifest = content.manifest;
  const existing = releases.get(`${manifest.id}@${manifest.version}`);
  if (existing) return existing;
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  fixture.sqlite
    .prepare(
      "INSERT OR IGNORE INTO plugins(id,publisher_id,repository_id,repository) VALUES(?,'validation','fixture','https://example.invalid/validation')"
    )
    .run(manifest.id);
  fixture.sqlite
    .prepare(
      "INSERT INTO uploads(id,publisher_id,status,file_name,size,object_key,sha256,content_json,created_at) VALUES(?,'validation','ready','fixture.zip',?,?,?,?,?)"
    )
    .run(id, bytes.length, id, hash(bytes), JSON.stringify(content), now);
  fixture.objects.set(id, { bytes, contentType: "application/zip" });
  fixture.sqlite
    .prepare(
      "INSERT INTO submissions(id,publisher_id,client_request_id,status,package_upload_id,content_json,repository,source_commit,plugin_id,plugin_version,created_at,updated_at,submitted_at) VALUES(?,'validation',?,'pending_review',?,?,'https://example.invalid/validation',?,?,?,?,?,?)"
    )
    .run(
      id,
      id,
      id,
      JSON.stringify(content),
      "a".repeat(40),
      manifest.id,
      manifest.version,
      now,
      now,
      now
    );
  const response = await handle(
    new Request(`${origin}/v1/submissions/${id}/review`, {
      method: "POST",
      headers: {
        Origin: fixture.env.WEB_ORIGIN,
        Cookie: "tau_session=validation-session",
        "X-CSRF-Token": "validation-csrf",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        revision: 1,
        decision: "approve",
        comment: "本机模拟器测试夹具",
      }),
    }),
    fixture.env
  );
  const result = await response.json();
  if (!response.ok || result.data?.release?.state !== "published")
    throw new Error(JSON.stringify(result));
  const row = fixture.sqlite
    .prepare("SELECT object_key FROM releases WHERE id=?")
    .get(result.data.release.id) as { object_key: string };
  const record = {
    submissionId: id,
    releaseId: result.data.release.id,
    bytes,
    sha256: hash(bytes),
    objectKey: row.object_key,
  };
  releases.set(`${manifest.id}@${manifest.version}`, record);
  await writeFile(path.join(output, `${manifest.id}-${manifest.version}.zip`), bytes);
  return record;
}
async function reset() {
  fixture.sqlite.close();
  fixture = testEnvironment({
    migrationsRoot: pathToFileURL(path.join(root, "apps/plugin-portal/infra/migrations/")),
  });
  fixture.env.PORTABLE_PUBLISH_ENABLED = "true";
  fixture.env.API_ORIGIN = origin;
  fixture.env.PORTABLE_PLATFORMS = "desktop,android,ios";
  fixture.env.REVIEWER_GITHUB_IDS = "validation";
  fixture.sqlite.exec("INSERT INTO publishers VALUES('validation','validation','');");
  fixture.sqlite
    .prepare("INSERT INTO sessions VALUES(?,'validation','unused','validation-csrf',?)")
    .run(hash("validation-session"), Date.now() + 86400000);
  releases = new Map();
  slow = new Set();
  await publish(counter("1.0.0"));
  await publish(await abc());
}
async function serve(request: IncomingMessage, response: ServerResponse) {
  try {
    const body: Buffer[] = [];
    for await (const chunk of request) body.push(Buffer.from(chunk));
    const url = new URL(request.url ?? "/", origin);
    const result = await handle(
      new Request(url, {
        method: request.method,
        headers: request.headers as Record<string, string>,
        body: body.length ? Buffer.concat(body) : undefined,
      }),
      fixture.env
    );
    response.writeHead(result.status, Object.fromEntries(result.headers));
    const bytes = Buffer.from(await result.arrayBuffer());
    const id = /^\/v2\/releases\/([^/]+)\/download$/.exec(url.pathname)?.[1];
    if (id && slow.has(id) && result.status === 200) {
      for (let start = 0; start < bytes.length && !response.destroyed; start += 512) {
        response.write(bytes.subarray(start, start + 512));
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      response.end();
    } else response.end(bytes);
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
}
const server = createServer((request, response) => {
  void serve(request, response);
});
let online = false;
async function network(enabled: boolean) {
  if (enabled === online) return;
  if (enabled) await new Promise<void>(resolve => server.listen(8787, "127.0.0.1", resolve));
  else {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  online = enabled;
}
await mkdir(output, { recursive: true });
await reset();
await network(true);
const admin = createServer(async (request, response) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const command = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : { op: "state" };
    if (command.op === "reset") {
      await network(true);
      await reset();
    }
    if (command.op === "network") await network(command.online === true);
    if (command.op === "publish") {
      if (!["1.0.1", "1.0.2"].includes(command.version)) throw new Error("未知测试版本");
      const record = await publish(counter(command.version));
      if (command.slow) slow.add(record.releaseId);
      if (command.corrupt)
        fixture.published.set(record.objectKey, {
          bytes: Buffer.from("invalid"),
          contentType: "application/zip",
        });
    }
    if (command.op === "repair") {
      const record = releases.get(`example.external-counter@${command.version}`);
      if (!record) throw new Error("未知版本");
      fixture.published.set(record.objectKey, {
        bytes: record.bytes,
        contentType: "application/zip",
      });
    }
    if (command.op === "revoke") {
      for (const key of ["example.external-counter@1.0.1", "tau.abc@0.1.0"]) {
        const record = releases.get(key);
        if (!record) throw new Error("未知版本");
        const result = await handle(
          new Request(`${origin}/v1/submissions/${record.submissionId}/revoke`, {
            method: "POST",
            headers: {
              Origin: fixture.env.WEB_ORIGIN,
              Cookie: "tau_session=validation-session",
              "X-CSRF-Token": "validation-csrf",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              reason: "模拟器撤回验证",
              clientRequestId: crypto.randomUUID(),
            }),
          }),
          fixture.env
        );
        if (!result.ok) throw new Error(await result.text());
      }
    }
    const state = {
      online,
      releases: Object.fromEntries(
        [...releases].map(([key, value]) => [
          key,
          { releaseId: value.releaseId, sha256: value.sha256, size: value.bytes.length },
        ])
      ),
    };
    await writeFile(path.join(output, "server-state.json"), JSON.stringify(state, null, 2));
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(state));
  } catch (error) {
    response.writeHead(400).end(String(error));
  }
});
admin.listen(8788, "127.0.0.1", () =>
  console.log("本机中心联调服务就绪：8787；隔离控制端口：8788")
);
