import { geolocation } from "./geo";
import { fail, sha256, shanghaiDay, type Env } from "./platform";

export function parseArtifact(filename: string) {
  const match =
    /^Tau-v(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)-(darwin|win32|linux)(?:-(arm64|x64|ia32))?\.(dmg|exe|AppImage|deb|rpm)$/.exec(
      filename
    );
  if (!match || filename.length > 160) return null;
  const [, version, os, arch = "unknown", extension] = match;
  if (
    (os === "darwin" && extension !== "dmg") ||
    (os === "win32" && extension !== "exe") ||
    (os === "linux" && !["AppImage", "deb", "rpm"].includes(extension))
  )
    return null;
  return { version, os, arch };
}

export async function download(request: Request, env: Env, filename: string): Promise<Response> {
  const artifact = parseArtifact(filename);
  if (!artifact) fail(404, "ARTIFACT", "安装包不存在");
  if (env.DOWNLOAD_ORIGIN !== "https://dl.taunote.app")
    fail(503, "DOWNLOAD_ORIGIN", "下载源配置无效");
  if (!(await env.RELEASES.head(`desktop/${filename}`))) fail(404, "ARTIFACT", "安装包不存在");
  const target = `${env.DOWNLOAD_ORIGIN}/desktop/${encodeURIComponent(filename)}`;
  const response = new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "no-store" },
  });
  if (
    request.method !== "GET" ||
    request.headers.has("Range") ||
    /prefetch|prerender/i.test(
      `${request.headers.get("Purpose") ?? ""} ${request.headers.get("Sec-Purpose") ?? ""}`
    ) ||
    /bot|crawler|spider|headless/i.test(request.headers.get("User-Agent") ?? "")
  )
    return response;
  try {
    const ip = request.headers.get("CF-Connecting-IP");
    if (!ip || !env.DOWNLOAD_HASH_KEY || env.DOWNLOAD_HASH_KEY.length < 32) return response;
    if (env.DOWNLOAD_LIMITER && !(await env.DOWNLOAD_LIMITER.limit({ key: ip })).success)
      return response;
    const day = shanghaiDay();
    const visitor = await sha256(
      JSON.stringify([env.DOWNLOAD_HASH_KEY, day, ip, request.headers.get("User-Agent") ?? ""])
    );
    const channel = new URL(request.url).searchParams.get("channel") ?? "direct";
    const geo = geolocation(request);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO download_receipts(day,artifact,visitor_hash,product,environment,version,os,arch,channel,country,region_code) VALUES(?,?,?,'tau-desktop','production',?,?,?,?,?,?)"
    )
      .bind(
        day,
        filename,
        visitor,
        artifact.version,
        artifact.os,
        artifact.arch,
        /^[a-z0-9_-]{1,32}$/.test(channel) ? channel : "direct",
        geo.country,
        geo.region_code
      )
      .run();
  } catch {
    console.error("analytics_download_count_failed");
  }
  return response;
}
