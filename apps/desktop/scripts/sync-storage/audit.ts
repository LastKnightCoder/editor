import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { S3Client, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { S3SyncProvider as DesktopProvider } from "../../src/utils/sync/S3SyncProvider";
import { S3SyncProvider as CliProvider } from "../../../cli/src/utils/sync-providers/s3";
import {
  readSnapshotHead,
  publishSnapshot,
  SYNC_MODEL_VERSION,
} from "@tau/db-schema/sync-protocol";
import { loadAuditCandidate } from "./load-candidate";

// 仅替换Electron桥接；提供方、SDK调用和版本提交函数均使用实际源码。
const candidateFile = process.argv[2];
if (!candidateFile) throw new Error("用法：node audit.mjs <作者构建的sync.js>");
const candidate = await loadAuditCandidate(candidateFile);
const settings = JSON.parse(await readFile(homedir() + "/.editor/setting.json", "utf8"));
const config = { ...settings.integration.s3, ...settings.sync.s3 };
const prefix =
  (config.pathPrefix || "").replace(/^\/+|\/+$/g, "") + "/tau-sync-audit-" + randomUUID();
const report: { prefix: string; traces: unknown[]; runs: unknown[]; cleanup: unknown[] } = {
  prefix,
  traces: [],
  runs: [],
  cleanup: [],
};
const log = console.log.bind(console);
const safe = (error: unknown) => {
  const value = error as {
    name?: string;
    Code?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return {
    name: value?.name,
    code: value?.Code ?? value?.code,
    status: value?.$metadata?.httpStatusCode,
  };
};
let run = "";
console.error = (...args: unknown[]) => {
  report.traces.push({ run, event: "error", ...safe(args.find(value => value instanceof Error)) });
};
console.warn = () => undefined;
const require = createRequire(import.meta.url);
for (const protocol of ["node:http", "node:https"]) {
  const transport = require(protocol);
  const original = transport.request;
  transport.request = function (this: unknown, ...args: unknown[]) {
    const input = args[0] as { method?: string; headers?: Record<string, string>; path?: string };
    const headers = input.headers ?? {};
    const trace = {
      run,
      transport: "sdk",
      method: input.method,
      path: String(input.path ?? "").split("?")[0],
      condition: headers["if-none-match"] ?? headers["If-None-Match"] ?? null,
      checksumHeaders: Object.keys(headers).filter(name => /checksum/i.test(name)),
      status: 0,
    };
    report.traces.push(trace);
    const request = original.apply(this, args);
    request.once("response", (response: { statusCode: number }) => {
      trace.status = response.statusCode;
    });
    request.setTimeout(15000, () => request.destroy(new Error("audit timeout")));
    return request;
  };
}
const originalFetch = globalThis.fetch;
syncBuiltinESMExports();
globalThis.fetch = async (input, init) => {
  const response = await originalFetch(input, { ...init, signal: AbortSignal.timeout(15000) });
  report.traces.push({
    run,
    transport: "fetch",
    method: init?.method ?? "GET",
    path: new URL(String(input)).pathname,
    status: response.status,
  });
  return response;
};
const pointer = "database_probe.json",
  databaseObject = "probe.db",
  sessionsObject = "probe.sessions.zip";
const objects = [databaseObject, sessionsObject, pointer, pointer + ".next-0"];
const cleaner = new S3Client({
  region: config.region,
  endpoint: config.endpoint,
  forcePathStyle: config.urlStyle === "path",
  credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  maxAttempts: 1,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
try {
  for (const label of ["desktop", "cli", "candidate"]) {
    run = label;
    const target = { ...config, pathPrefix: prefix + "/" + label };
    const result: Record<string, unknown> = { label };
    try {
      let provider;
      if (label === "desktop") provider = new DesktopProvider(target);
      else if (label === "cli") provider = new CliProvider(target);
      else {
        provider = candidate.create(target);
      }
      const parent = await readSnapshotHead(provider, pointer);
      result.initialVersion = parent.version;
      const payload = new TextEncoder().encode("tau isolated storage audit");
      result.databaseUploaded = await provider.uploadFile(databaseObject, payload);
      if (!result.databaseUploaded) throw new Error("database upload failed");
      result.sessionsUploaded = await provider.uploadFile(sessionsObject, payload);
      if (!result.sessionsUploaded) throw new Error("sessions upload failed");
      const next = {
        version: parent.version + 1,
        parentVersion: parent.version,
        dataModelVersion: SYNC_MODEL_VERSION,
        commitId: randomUUID(),
        databaseObject,
        sessionsObject,
      };
      try {
        await publishSnapshot(provider, pointer, parent, next);
        result.published = true;
      } catch (error) {
        result.published = false;
        result.publishError = safe(error);
      }
      result.finalVersion = (await readSnapshotHead(provider, pointer)).version;
      result.payloadMatches = Buffer.from(await provider.downloadFile(databaseObject)).equals(
        Buffer.from(payload)
      );
    } catch (error) {
      result.error = safe(error);
    } finally {
      report.runs.push(result);
    }
  }
} finally {
  run = "cleanup";
  for (const label of ["desktop", "cli", "candidate"])
    for (const object of objects) {
      const Key = prefix + "/" + label + "/" + object;
      try {
        await cleaner.send(new DeleteObjectCommand({ Bucket: config.bucket, Key }));
        const confirmation = await cleaner
          .send(new HeadObjectCommand({ Bucket: config.bucket, Key }))
          .then(
            () => ({ absent: false }),
            error =>
              safe(error).status === 404 ? { absent: true } : { absent: false, error: safe(error) }
          );
        report.cleanup.push({ key: Key, ...confirmation });
      } catch (error) {
        report.cleanup.push({ key: Key, error: safe(error) });
      }
    }
  cleaner.destroy();
  log(JSON.stringify(report, null, 2));
}
