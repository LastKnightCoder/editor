import { centerRoute } from "./center";
import type { ApiError } from "../contracts";
import { authRoute, githubToken, requireSession } from "./auth";
import { fail, HttpError, json, type Env, type BackgroundTasks } from "./platform";
import { purgeStaleUploads, uploadRoute } from "./uploads";
import { submissionRoute } from "./submissions";
import { feedbackRoute } from "./feedback";
import { reviewRoute } from "./reviews";
import { publicReleaseRoute } from "./releases";
import { visitorRoute } from "./visitors";
import { communityRoute } from "./community";
import { moderationRoute } from "./moderation";
import { pluginModerationRoute } from "./plugin-moderation";
import { appFeedbackModerationRoute, appFeedbackRoute, cleanAppFeedback } from "./app-feedback";
import { ciRoute } from "./ci";
import { cleanDownloadReceipts } from "./download-statistics";

export async function handle(
  request: Request,
  env: Env,
  context?: BackgroundTasks
): Promise<Response> {
  const origin = request.headers.get("Origin");
  let response: Response;
  try {
    if (origin && origin !== env.WEB_ORIGIN) fail(403, "FORBIDDEN", "不允许的请求来源");
    if (request.method === "OPTIONS") {
      response = new Response(null, { status: 204 });
      response.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type,X-CSRF-Token,X-Tau-Visitor,Authorization"
      );
    } else {
      const path = new URL(request.url).pathname;
      const auth =
        (await visitorRoute(request, env, path)) ??
        (await authRoute(request, env, path)) ??
        (await ciRoute(request, env, path)) ??
        (await appFeedbackRoute(request, env, path));
      if (auth) response = auth;
      else if (path === "/health" && request.method === "GET") response = json({ ok: true });
      else {
        const publicRelease =
          (await centerRoute(request, env, path, context)) ??
          (await communityRoute(request, env, path)) ??
          (await publicReleaseRoute(request, env, path, context));
        if (publicRelease) response = publicRelease;
        else {
          const session = await requireSession(request, env);
          // 插件管理先于评论管理匹配：后者对一切未命中的 /v1/moderation/* 直接回 404。
          response =
            (await pluginModerationRoute(request, env, session.publisher_id, path)) ??
            (await appFeedbackModerationRoute(request, env, session.publisher_id, path)) ??
            (await moderationRoute(request, env, session.publisher_id, path)) ??
            (await uploadRoute(request, env, session.publisher_id, path)) ??
            (await feedbackRoute(request, env, session.publisher_id, path)) ??
            (await reviewRoute(request, env, session.publisher_id, path)) ??
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
export default {
  fetch: handle,
  scheduled: (_event: unknown, env: Env) =>
    Promise.all([cleanDownloadReceipts(env), cleanAppFeedback(env), purgeStaleUploads(env)]),
};
