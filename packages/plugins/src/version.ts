function parseVersion(value: string) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      value
    );
  if (!match) throw new Error(`版本号无效：${value}`);
  const pre = match[4]?.split(".") ?? [];
  if (pre.some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0")))
    throw new Error(`版本号无效：${value}`);
  return { core: match.slice(1, 4), pre };
}

export function comparePluginVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const numeric = (x: string, y: string) =>
    BigInt(x) === BigInt(y) ? 0 : BigInt(x) > BigInt(y) ? 1 : -1;
  for (let index = 0; index < 3; index++) {
    const result = numeric(a.core[index], b.core[index]);
    if (result) return result;
  }
  if (!a.pre.length || !b.pre.length)
    return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index++) {
    const x = a.pre[index],
      y = b.pre[index];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x),
      ny = /^\d+$/.test(y);
    return nx && ny ? numeric(x, y) : nx !== ny ? (nx ? -1 : 1) : x > y ? 1 : -1;
  }
  return 0;
}

export function assertPluginCompatibility(
  manifest: { minAppVersion?: string },
  clientVersion: string
) {
  if (manifest.minAppVersion && comparePluginVersions(clientVersion, manifest.minAppVersion) < 0) {
    throw new Error(`插件需要 Tau ${manifest.minAppVersion} 或更高版本，当前为 ${clientVersion}`);
  }
}
