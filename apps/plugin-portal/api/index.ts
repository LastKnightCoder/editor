import type { ApiError } from "../contracts";
import { authRoute, githubToken, requireSession } from "./auth";
import { fail, HttpError, json, type Env } from "./platform";
import { uploadRoute } from "./uploads";
import { submissionRoute } from "./submissions";
import { feedbackRoute } from "./feedback";

export async function handle(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  let response: Response;
  try {
    if (origin && origin !== env.WEB_ORIGIN) fail(403, "FORBIDDEN", "不允许的请求来源");
    if (request.method === "OPTIONS") {
      response = new Response(null, { status: 204 });
      response.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type,X-CSRF-Token");
    } else {
      const path = new URL(request.url).pathname;
      const auth = await authRoute(request, env, path);
      if (auth) response = auth;
      else if (path === "/health" && request.method === "GET") response = json({ ok: true });
      else {
        const session = await requireSession(request, env);
        response =
          (await uploadRoute(request, env, session.publisher_id, path)) ??
          (await feedbackRoute(request, env, session.publisher_id, path)) ??
          (await submissionRoute(
            request,
            env,
            session.publisher_id,
            () => githubToken(env, session),
            path
          )) ??
          fail(404, "NOT_FOUND", "接口不存在");
      }
    }
  } catch (error) {
    const issue =
      error instanceof HttpError
        ? error
        : new HttpError(500, "INTERNAL_ERROR", "服务处理失败，请重试");
    response = Response.json(
      {
        error: {
          code: issue.code,
          message: issue.message,
          ...(issue.fields ? { fields: issue.fields } : {}),
          requestId: crypto.randomUUID(),
        },
      } satisfies ApiError,
      { status: issue.status }
    );
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Vary", "Origin");
  if (origin === env.WEB_ORIGIN) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return response;
}
export default { fetch: handle };
