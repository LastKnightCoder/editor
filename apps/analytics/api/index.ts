import { authRoute, requireAdmin } from "./auth";
import { cleanup } from "./cleanup";
import { download } from "./downloads";
import { ingest } from "./ingest";
import { fail, HttpError, json, type Env } from "./platform";
import { queryRoute } from "./queries";

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const isPublic = !url.pathname.startsWith("/v1/admin/");
  const allowed = origin === url.origin || env.ALLOWED_ORIGINS.split(",").includes(origin ?? "");
  let response: Response;
  try {
    if (origin && !allowed) fail(403, "ORIGIN", "不允许的请求来源");
    if (request.method === "OPTIONS") {
      response = new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Max-Age": "600",
        },
      });
    } else if (url.pathname === "/health" && request.method === "GET") {
      await env.DB.prepare("SELECT 1 FROM events LIMIT 1").first();
      response = json({ ok: true, schema_version: 1 });
    } else if (url.pathname === "/v1/events/batch" && request.method === "POST")
      response = await ingest(request, env);
    else if (url.pathname.startsWith("/v1/downloads/") && ["GET", "HEAD"].includes(request.method))
      response = await download(
        request,
        env,
        decodeURIComponent(url.pathname.slice("/v1/downloads/".length))
      );
    else if (url.pathname.startsWith("/v1/admin/")) {
      const auth = await authRoute(request, env, url.pathname);
      if (auth) response = auth;
      else {
        await requireAdmin(request, env);
        if (request.method !== "GET") fail(405, "METHOD", "请求方法不支持");
        response =
          url.pathname === "/v1/admin/session"
            ? json({ authenticated: true })
            : await queryRoute(request, env);
      }
    } else if (url.pathname.startsWith("/v1/")) response = fail(404, "NOT_FOUND", "接口不存在");
    else response = await env.ASSETS.fetch(request);
  } catch (error) {
    const issue =
      error instanceof HttpError
        ? error
        : new HttpError(503, "SERVICE_UNAVAILABLE", "统计服务暂时不可用，请稍后重试");
    if (!(error instanceof HttpError)) console.error("analytics_request_failed");
    response = Response.json(
      { error: { code: issue.code, message: issue.message } },
      { status: issue.status }
    );
    if (issue.status === 429) response.headers.set("Retry-After", "60");
  }
  response = new Response(response.body, response);
  if (url.pathname.startsWith("/v1/") || url.pathname === "/health")
    response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Vary", "Origin");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"
  );
  if (origin && allowed && isPublic) response.headers.set("Access-Control-Allow-Origin", origin);
  return response;
}
export default { fetch: handle, scheduled: (_event: unknown, env: Env) => cleanup(env) };
