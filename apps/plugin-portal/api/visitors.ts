import type { VisitorSession } from "../contracts";
import { body, cookie, fail, json, randomToken, setCookie, sha256, type Env } from "./platform";

export async function visitorFor(request: Request, env: Env) {
  const token =
    request.headers.get("Authorization")?.match(/^Bearer ([\w-]{64,128})$/)?.[1] ??
    cookie(request, "tau_visitor");
  if (!token || token.length > 128) return null;
  return env.DB.prepare("SELECT id,revoked FROM visitors WHERE token_hash=?")
    .bind(await sha256(token))
    .first<{ id: string; revoked: number }>();
}

export async function visitorRoute(request: Request, env: Env, path: string) {
  if (path !== "/v1/visitor-session" || request.method !== "POST") return null;
  if (request.headers.get("X-Tau-Visitor") !== "1") fail(403, "FORBIDDEN", "缺少匿名会话请求标识");
  const input = await body(request);
  const desktop = input.client === "desktop";
  if ((!desktop && input.client !== "web") || (desktop && request.headers.has("Origin")))
    fail(400, "INVALID_INPUT", "匿名会话客户端类型无效");
  const previous = await visitorFor(request, env);
  if (previous?.revoked) fail(403, "FORBIDDEN", "匿名身份已停用");
  if (previous) return json<VisitorSession>({ visitorId: previous.id });
  if (!env.TOKEN_ENCRYPTION_KEY) fail(503, "SERVICE_UNAVAILABLE", "匿名身份服务暂不可用");
  const hour = new Date().toISOString().slice(0, 13);
  const bucket = await sha256(
    `${env.TOKEN_ENCRYPTION_KEY}:visitor:${request.headers.get("CF-Connecting-IP") ?? "local"}:${hour}`
  );
  const limit = await env.DB.prepare(
    "INSERT INTO visitor_issue_limits(bucket,hour,count) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<60"
  )
    .bind(bucket, hour)
    .run();
  if (!limit.meta.changes) fail(429, "LIMIT_EXCEEDED", "申请过于频繁，请稍后重试");
  const id = crypto.randomUUID(),
    token = randomToken();
  await env.DB.prepare("INSERT INTO visitors(id,token_hash,created_at) VALUES(?,?,?)")
    .bind(id, await sha256(token), new Date().toISOString())
    .run();
  const response = json<VisitorSession>({ visitorId: id, ...(desktop ? { token } : {}) });
  if (!desktop)
    response.headers.set("Set-Cookie", setCookie(env, "tau_visitor", token, 365 * 86400));
  return response;
}
