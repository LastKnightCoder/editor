import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";

const hash = value => createHash("sha256").update(value).digest("hex");
const buildToken = value => typeof value === "string" && /^[A-Za-z0-9-]{1,100}$/.test(value);

async function readInput(file) {
  if ((await stat(file)).size > 32 * 1024 * 1024) throw new Error("诊断输入超过 32 MiB");
  const buffer = await readFile(file);
  return (
    file.endsWith(".gz") ? gunzipSync(buffer, { maxOutputLength: 32 * 1024 * 1024 }) : buffer
  ).toString("utf8");
}

export function frameAsset(url) {
  if (typeof url !== "string") return;
  let value;
  try {
    value = decodeURIComponent(url).replaceAll("\\", "/");
  } catch {
    return;
  }
  const normalized = value.match(
    /(?:^|\/)(dist-electron\/(main|preload)|dist)\/(.+?\.[cm]?js)(?:[?#].*)?$/
  );
  const key = normalized ? `${normalized[2] ?? "renderer"}/${normalized[3]}` : value;
  return /^(main|preload|renderer)\/[A-Za-z0-9_./-]+\.[cm]?js$/.test(key) &&
    !key.split("/").includes("..")
    ? key
    : undefined;
}

export class PerfSymbolicator {
  constructor(directory) {
    this.directory = path.resolve(directory);
    this.maps = new Map();
  }

  async locate(buildId, frame) {
    if (!frame || typeof frame !== "object") return { unmapped: "invalid-frame" };
    const key = frameAsset(frame.url);
    if (!buildToken(buildId) || buildId === "development")
      return { ...frame, unmapped: "missing-build-id" };
    if (!key) return { ...frame, unmapped: "external-or-native" };
    if (
      !(
        Number.isInteger(frame.lineNumber) &&
        frame.lineNumber >= 0 &&
        Number.isInteger(frame.columnNumber) &&
        frame.columnNumber >= 0
      )
    )
      return { ...frame, unmapped: "missing-position" };
    const cacheKey = `${buildId}/${key}`;
    try {
      let map = this.maps.get(cacheKey);
      if (!map) {
        const nested = path.join(this.directory, buildId);
        const directory = path.basename(this.directory) === buildId ? this.directory : nested;
        const target = key.split("/")[0];
        const manifest = JSON.parse(
          await readFile(path.join(directory, `manifest-${target}.json`), "utf8")
        );
        if (manifest.buildId !== buildId) return { ...frame, unmapped: "build-mismatch" };
        const entry = manifest.files?.[key];
        if (!entry) return { ...frame, unmapped: "missing-asset" };
        if (entry.unmapped) return { ...frame, unmapped: "generated-code" };
        if (entry.map !== `${key}.map`) return { ...frame, unmapped: "invalid-symbols" };
        const mapFile = path.join(directory, entry.map);
        if ((await stat(mapFile)).size > 256 * 1024 * 1024)
          return { ...frame, unmapped: "map-byte-budget" };
        const bytes = await readFile(mapFile);
        if (hash(bytes) !== entry.mapSha256) return { ...frame, unmapped: "map-hash-mismatch" };
        map = new TraceMap(JSON.parse(bytes.toString("utf8")));
        this.maps.set(cacheKey, map);
        if (this.maps.size > 4) this.maps.delete(this.maps.keys().next().value);
      }
      const original = originalPositionFor(map, {
        line: frame.lineNumber + 1,
        column: frame.columnNumber,
      });
      return original.source && original.line !== null
        ? {
            ...frame,
            original: {
              file: original.source,
              line: original.line,
              column: original.column + 1,
              name: original.name ?? frame.functionName,
            },
          }
        : { ...frame, unmapped: "no-mapping" };
    } catch (error) {
      return {
        ...frame,
        unmapped: error?.code === "ENOENT" ? "missing-symbols" : "invalid-symbols",
      };
    }
  }
}

export async function symbolicatePerf(snapshot, directory, log = "", includeProfiles = false) {
  const symbols = new PerfSymbolicator(directory);
  const incidents = Array.isArray(snapshot.incidents)
    ? snapshot.incidents
    : snapshot.cpu
      ? [snapshot]
      : [];
  const cpu = [];
  for (const incident of incidents.slice(0, 10)) {
    const capture = incident.cpu;
    if (!capture) continue;
    const top = [];
    for (const row of (capture.summary?.top ?? []).slice(0, 12))
      top.push({ ...row, frame: await symbols.locate(capture.buildId, row.frame) });
    let profile;
    if (includeProfiles && capture.profile?.nodes) {
      const mapped = new Map();
      const grouped = new Map();
      for (const node of capture.profile.nodes) {
        const key = node.callFrame?.url;
        const group = grouped.get(key) ?? [];
        group.push(node);
        grouped.set(key, group);
      }
      for (const nodes of grouped.values())
        for (const node of nodes) {
          const frame = await symbols.locate(capture.buildId, node.callFrame);
          mapped.set(
            node.id,
            frame.original
              ? {
                  ...node,
                  callFrame: {
                    ...node.callFrame,
                    url: frame.original.file,
                    functionName: frame.original.name,
                    lineNumber: frame.original.line - 1,
                    columnNumber: frame.original.column - 1,
                  },
                }
              : node
          );
        }
      profile = {
        ...capture.profile,
        nodes: capture.profile.nodes.map(node => mapped.get(node.id)),
      };
    }
    cpu.push({
      incidentId: incident.id,
      ...capture,
      profile,
      summary: capture.summary ? { ...capture.summary, top } : undefined,
    });
  }
  const stacks = [];
  const buildId = snapshot.meta?.buildId ?? snapshot.environment?.buildId;
  const pattern = /((?:file:\/\/\/|[A-Za-z]:[\\/]|\/)[^\s()]+?\.[cm]?js):(\d+):(\d+)/g;
  for (const match of log.matchAll(pattern)) {
    if (stacks.length >= 200) break;
    if (!frameAsset(match[1])) continue;
    stacks.push(
      await symbols.locate(buildId, {
        functionName: "",
        url: match[1],
        scriptId: "0",
        lineNumber: Number(match[2]) - 1,
        columnNumber: Number(match[3]) - 1,
      })
    );
  }
  return { schemaVersion: 1, buildId, cpu, stacks };
}

async function main() {
  const args = process.argv.slice(2);
  const option = name => {
    const at = args.indexOf(name);
    return at < 0 ? undefined : args[at + 1];
  };
  const input = option("--input"),
    directory = option("--symbols"),
    output = option("--output");
  if (!input || !directory || !output)
    throw new Error(
      "用法：node scripts/perf-symbolicate.mjs --input perf.json.gz --symbols output/diagnostics-symbols --output report.json [--log app.log.gz]"
    );
  const logFile = option("--log");
  const profiles = option("--profiles");
  const report = await symbolicatePerf(
    JSON.parse(await readInput(input)),
    directory,
    logFile ? await readInput(logFile) : "",
    Boolean(profiles)
  );
  if (profiles) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(profiles, { recursive: true });
    for (const [index, capture] of report.cpu.entries()) {
      if (capture.profile)
        await writeFile(
          path.join(profiles, `cpu-${index + 1}.cpuprofile`),
          JSON.stringify(capture.profile)
        );
      delete capture.profile;
    }
  }
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(
    `已输出 ${report.cpu.length} 个 CPU 摘要和 ${report.stacks.length} 个堆栈位置：${output}`
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
