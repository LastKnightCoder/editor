import { enforceLimit, fail, json, readJson, sha256, type Env } from "./platform";

const COOKIE = "tau_analytics_session";
const SESSION_SECONDS = 8 * 3600;
const encoder = new TextEncoder();

async function signature(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signed), byte => byte.toString(16).padStart(2, "0")).join("");
}
async function equal(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([sha256(a), sha256(b)]);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
function secret(env: Env): string {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32)
    fail(503, "ADMIN_NOT_CONFIGURED", "管理员凭据尚未配置");
  return env.ADMIN_TOKEN;
}
function cookie(request: Request, value: string, maxAge: number): string {
  return `${COOKIE}=${value}; Path=/v1/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    fail(403, "ORIGIN", "管理操作仅允许同源请求");
}
export async function authRoute(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response | null> {
  if (pathname === "/v1/admin/login" && request.method === "POST") {
    requireSameOrigin(request);
    await enforceLimit(request, env.LOGIN_LIMITER);
    const token = secret(env);
    const input = await readJson(request, 4096);
    if (
      typeof input.token !== "string" ||
      input.token.length > 1024 ||
      !(await equal(input.token, token))
    )
      fail(401, "UNAUTHORIZED", "管理员凭据无效");
    const value = `${Math.floor(Date.now() / 1000) + SESSION_SECONDS}.${crypto.randomUUID()}`;
    const response = json({ authenticated: true });
    response.headers.set(
      "Set-Cookie",
      cookie(request, `${value}.${await signature(value, token)}`, SESSION_SECONDS)
    );
    return response;
  }
  if (pathname === "/v1/admin/logout" && request.method === "POST") {
    requireSameOrigin(request);
    const response = json({ authenticated: false });
    response.headers.set("Set-Cookie", cookie(request, "", 0));
    return response;
  }
  return null;
}
export async function requireAdmin(request: Request, env: Env): Promise<void> {
  requireSameOrigin(request);
  const token = secret(env);
  const bearer = request.headers.get("Authorization")?.match(/^Bearer (.{1,1024})$/)?.[1];
  if (bearer && (await equal(bearer, token))) return;
  const value = request.headers
    .get("Cookie")
    ?.split(";")
    .map(item => item.trim())
    .find(item => item.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  if (value && value.length < 256) {
    const [expires, nonce, supplied, extra] = value.split(".");
    if (
      !extra &&
      /^\d+$/.test(expires) &&
      /^[a-f0-9-]{36}$/.test(nonce ?? "") &&
      /^[a-f0-9]{64}$/.test(supplied ?? "") &&
      Number(expires) > Date.now() / 1000 &&
      (await equal(supplied, await signature(`${expires}.${nonce}`, token)))
    )
      return;
  }
  fail(401, "UNAUTHORIZED", "请先登录统计后台");
}
