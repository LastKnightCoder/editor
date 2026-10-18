import { fetchReleaseInfo, renderDownloadButtons, renderReleaseMeta } from "../build/release.ts";

export const onRequest: PagesFunction = async ({ request, next }) => {
  const pathname = new URL(request.url).pathname;
  if (request.method !== "GET" || !["/", "/index.html"].includes(pathname)) return next();

  // 静态文件的条件请求不能跳过发布信息更新。
  const headers = new Headers(request.headers);
  headers.delete("If-None-Match");
  headers.delete("If-Modified-Since");
  const original = await next(new Request(request, { headers }));
  if (original.status !== 200 || !original.headers.get("Content-Type")?.includes("text/html"))
    return original;

  const response = new Response(original.body, original);
  response.headers.set("Cache-Control", "no-store");
  response.headers.delete("ETag");
  response.headers.delete("Last-Modified");
  response.headers.delete("Content-Length");

  try {
    const info = await fetchReleaseInfo(url =>
      fetch(url, {
        signal: AbortSignal.timeout(5_000),
        cf: {
          cacheEverything: true,
          cacheTtlByStatus: { "200-299": 60, "404": 60, "500-599": -1 },
        },
      })
    );
    response.headers.set("X-Tau-Release-Source", "live");
    return new HTMLRewriter()
      .on("[data-release-downloads]", {
        element(element) {
          element.setInnerContent(renderDownloadButtons(info), { html: true });
        },
      })
      .on("[data-release-meta]", {
        element(element) {
          element.setInnerContent(renderReleaseMeta(info));
        },
      })
      .on("[data-release-version]", {
        element(element) {
          element.setInnerContent(info.version);
        },
      })
      .transform(response);
  } catch (error) {
    console.error("[website] 实时发布信息不可用，保留构建快照", error);
    response.headers.set("X-Tau-Release-Source", "snapshot");
    return response;
  }
};
