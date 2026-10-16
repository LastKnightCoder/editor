import type { Session } from "../contracts";
import { cookie, fail, json, randomToken, setCookie, sha256, type Env } from "./platform";
import { github } from "./github";

interface SessionRow {
  token_hash: string;
  publisher_id: string;
  github_token: string;
  csrf_token: string;
  login: string;
  avatar_url: string;
}
async function encryptionKey(env: Env): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey(
      "raw",
      Uint8Array.from(atob(env.TOKEN_ENCRYPTION_KEY), c => c.charCodeAt(0)),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"]
    );
  } catch {
    return fail(503, "SERVICE_UNAVAILABLE", "登录服务尚未配置");
  }
}
async function encrypt(env: Env, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    new TextEncoder().encode(token)
  );
  return (
    btoa(String.fromCharCode(...iv)) + "." + btoa(String.fromCharCode(...new Uint8Array(encrypted)))
  );
}
export async function githubToken(env: Env, session: SessionRow): Promise<string> {
  const [iv, encrypted] = session.github_token
    .split(".")
    .map(x => Uint8Array.from(atob(x), c => c.charCodeAt(0)));
  return new TextDecoder().decode(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await encryptionKey(env), encrypted)
  );
}
export async function sessionFor(request: Request, env: Env): Promise<SessionRow | null> {
  const token = cookie(request, "tau_session");
  if (!token) return null;
  return env.DB.prepare(
    `SELECT s.*, p.login, p.avatar_url FROM sessions s JOIN publishers p ON p.id=s.publisher_id WHERE s.token_hash=? AND s.expires_at>?`
  )
    .bind(await sha256(token), Date.now())
    .first<SessionRow>();
}
export async function requireSession(request: Request, env: Env): Promise<SessionRow> {
  const session = await sessionFor(request, env);
  if (!session) fail(401, "UNAUTHENTICATED", "请先使用 GitHub 登录");
  if (
    !["GET", "HEAD"].includes(request.method) &&
    (request.headers.get("Origin") !== env.WEB_ORIGIN ||
      request.headers.get("X-CSRF-Token") !== session.csrf_token)
  ) {
    fail(403, "FORBIDDEN", "请求来源或会话校验失败，请刷新后重试");
  }
  return session;
}
export async function authRoute(
  request: Request,
  env: Env,
  path: string
): Promise<Response | null> {
  if (path === "/v1/session" && request.method === "GET") {
    const session = await sessionFor(request, env);
    return json<Session>({
      user: session
        ? { id: session.publisher_id, login: session.login, avatarUrl: session.avatar_url }
        : null,
      csrfToken: session?.csrf_token ?? null,
    });
  }
  if (path === "/v1/logout" && request.method === "POST") {
    const session = await requireSession(request, env);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(session.token_hash).run();
    const response = json({ loggedOut: true });
    response.headers.set("Set-Cookie", setCookie(env, "tau_session", "", 0));
    return response;
  }
  if (path === "/v1/auth/github" && request.method === "GET") {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET)
      fail(503, "SERVICE_UNAVAILABLE", "GitHub 登录尚未配置");
    await encryptionKey(env);
    const state = randomToken();
    const verifier = randomToken();
    const challenge = btoa(
      String.fromCharCode(
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))
      )
    )
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    await env.DB.prepare("INSERT INTO oauth_states VALUES (?,?,?)")
      .bind(await sha256(state), verifier, Date.now() + 600000)
      .run();
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: env.API_ORIGIN + "/v1/auth/github/callback",
      state,
      scope: "read:user",
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    return new Response(null, {
      status: 302,
      headers: { Location: url.href, "Set-Cookie": setCookie(env, "tau_oauth", state, 600) },
    });
  }
  if (path === "/v1/auth/github/callback" && request.method === "GET") {
    try {
      const params = new URL(request.url).searchParams;
      const state = params.get("state");
      if (!state || cookie(request, "tau_oauth") !== state || !params.get("code"))
        throw new Error();
      const stored = await env.DB.prepare(
        "DELETE FROM oauth_states WHERE token_hash=? AND expires_at>? RETURNING verifier"
      )
        .bind(await sha256(state), Date.now())
        .first<{ verifier: string }>();
      if (!stored) throw new Error();
      const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code: params.get("code"),
          redirect_uri: env.API_ORIGIN + "/v1/auth/github/callback",
          code_verifier: stored.verifier,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const result = (await response.json()) as { access_token?: string };
      if (!response.ok || !result.access_token) throw new Error();
      const user = await github<{ id: number; login: string; avatar_url: string }>(
        result.access_token,
        "/user"
      );
      const token = randomToken();
      const previous = cookie(request, "tau_session");
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO publishers VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login,avatar_url=excluded.avatar_url"
        ).bind(String(user.id), user.login, user.avatar_url),
        env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(
          await sha256(previous ?? "")
        ),
        env.DB.prepare("INSERT INTO sessions VALUES (?,?,?,?,?)").bind(
          await sha256(token),
          String(user.id),
          await encrypt(env, result.access_token),
          randomToken(),
          Date.now() + 7 * 86400000
        ),
      ]);
      const headers = new Headers({ Location: env.WEB_ORIGIN + "/submissions" });
      headers.append("Set-Cookie", setCookie(env, "tau_session", token, 7 * 86400));
      headers.append("Set-Cookie", setCookie(env, "tau_oauth", "", 0));
      return new Response(null, { status: 302, headers });
    } catch {
      return new Response(null, {
        status: 302,
        headers: {
          Location: env.WEB_ORIGIN + "/login?error=oauth_failed",
          "Set-Cookie": setCookie(env, "tau_oauth", "", 0),
        },
      });
    }
  }
  return null;
}
