import {
  CPU_DURATION_MS,
  CPU_PROFILE_BYTES,
  type CpuFrame,
  type CpuProfile,
  type CpuSummary,
} from "../../../shared/perf-cpu";

const systemFrames = new Set(["(root)", "(program)", "(idle)", "(garbage collector)"]);

/** 只保留本次安装产物身份，避免 profile 携带用户名、脚本参数或外部脚本名称。 */
export function cpuAssetUrl(url: string, appRoot: string): string {
  if (url.startsWith("node:") || url.startsWith("electron:"))
    return url.split("?")[0].slice(0, 160);
  let value: string;
  try {
    value = decodeURIComponent(url.split(/[?#]/)[0])
      .replaceAll("\\", "/")
      .replace(/^file:\/\//, "");
  } catch {
    return "external";
  }
  const root = appRoot.replaceAll("\\", "/").replace(/\/$/, "");
  if (/^\/[A-Za-z]:\//.test(value)) value = value.slice(1);
  const belongs = /^[A-Za-z]:\//.test(root)
    ? value.toLowerCase().startsWith(`${root.toLowerCase()}/`)
    : value.startsWith(`${root}/`);
  if (!belongs) return "external";
  const relative = value.slice(root.length + 1);
  const target = relative.startsWith("dist-electron/main/")
    ? `main/${relative.slice(19)}`
    : relative.startsWith("dist-electron/preload/")
      ? `preload/${relative.slice(22)}`
      : relative.startsWith("dist/")
        ? `renderer/${relative.slice(5)}`
        : "external";
  return /^(main|preload|renderer)\/[A-Za-z0-9_./-]+\.[cm]?js$/.test(target) &&
    !target.split("/").includes("..")
    ? target
    : "external";
}

function cleanFrame(frame: CpuFrame, appRoot: string): CpuFrame {
  const url = cpuAssetUrl(frame.url, appRoot);
  return {
    functionName: systemFrames.has(frame.functionName)
      ? frame.functionName
      : url === "external"
        ? "(external)"
        : frame.functionName.slice(0, 160),
    scriptId: /^\d+$/.test(frame.scriptId) ? frame.scriptId : "0",
    url,
    lineNumber: Number.isInteger(frame.lineNumber) ? frame.lineNumber : -1,
    columnNumber: Number.isInteger(frame.columnNumber) ? frame.columnNumber : -1,
  };
}

export function prepareCpuProfile(raw: CpuProfile, appRoot: string) {
  if (
    !Array.isArray(raw.nodes) ||
    raw.nodes.length > 100_000 ||
    !Number.isFinite(raw.startTime) ||
    !Number.isFinite(raw.endTime)
  )
    throw new Error("invalid-profile");
  const nodes = new Map(raw.nodes.map(node => [node.id, node]));
  const parents = new Map<number, number>();
  for (const node of raw.nodes)
    for (const child of node.children ?? []) parents.set(child, node.id);
  const kept = new Map<number, CpuProfile["nodes"][number]>();
  const weights = new Map<number, { selfMs: number; totalMs: number }>();
  const samples: number[] = [],
    timeDeltas: number[] = [];
  let elapsedUs = 0,
    keptUs = 0;
  const count = raw.samples?.length ?? 0;
  for (let i = 0; i < Math.min(count, 20_000); i++) {
    const delta = raw.timeDeltas?.[i];
    if (typeof delta !== "number" || !Number.isFinite(delta) || delta < 0) continue;
    const remaining = CPU_DURATION_MS * 1000 - elapsedUs;
    elapsedUs += delta;
    if (remaining <= 0 || samples.length >= 1000) break;
    const id = raw.samples?.[i];
    if (id === undefined) continue;
    const chain = new Set<number>();
    let cursor: number | undefined = id;
    while (cursor !== undefined && chain.size < 128 && !chain.has(cursor) && nodes.has(cursor)) {
      chain.add(cursor);
      cursor = parents.get(cursor);
    }
    if (
      cursor !== undefined ||
      !chain.size ||
      kept.size + [...chain].filter(key => !kept.has(key)).length > 4096
    )
      continue;
    const duration = Math.min(delta, remaining);
    samples.push(id);
    timeDeltas.push(duration);
    keptUs += duration;
    for (const key of chain) {
      const node = nodes.get(key);
      if (!node) continue;
      if (!kept.has(key))
        kept.set(key, { id: key, callFrame: cleanFrame(node.callFrame, appRoot) });
      const weight = weights.get(key) ?? { selfMs: 0, totalMs: 0 };
      weight.totalMs += duration / 1000;
      if (key === id) weight.selfMs += duration / 1000;
      weights.set(key, weight);
    }
  }
  for (const node of kept.values())
    node.children = nodes.get(node.id)?.children?.filter(child => kept.has(child));
  const profile: CpuProfile = {
    nodes: raw.nodes.flatMap(node => {
      const value = kept.get(node.id);
      return value ? [value] : [];
    }),
    startTime: raw.startTime,
    endTime: raw.startTime + keptUs,
    samples,
    timeDeltas,
  };
  const summary: CpuSummary = {
    samples: samples.length,
    sampledMs: keptUs / 1000,
    omittedSamples: count - samples.length,
    top: [...weights]
      .sort((a, b) => b[1].selfMs - a[1].selfMs)
      .slice(0, 12)
      .map(([id, weight]) => {
        const node = kept.get(id);
        if (!node) throw new Error("profile-node-missing");
        return { frame: node.callFrame, ...weight };
      }),
  };
  const omitted = !samples.length || Buffer.byteLength(JSON.stringify(profile)) > CPU_PROFILE_BYTES;
  return {
    profile: omitted ? undefined : profile,
    summary,
    actualDurationMs: Math.max(0, (raw.endTime - raw.startTime) / 1000),
    profileOmitted: omitted,
  };
}
