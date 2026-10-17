import type { FeedbackMessage } from "../contracts";
import { body, fail, json, type Env } from "./platform";
import { submissionAccess } from "./submissions";
interface Row {
  id: string;
  publisher_id: string;
  login: string;
  role: FeedbackMessage["role"];
  message: string;
  created_at: string;
}
const dto = (r: Row): FeedbackMessage => ({
  id: r.id,
  author: { id: r.publisher_id, login: r.login },
  role: r.role,
  message: r.message,
  createdAt: r.created_at,
});
export async function feedbackRoute(
  request: Request,
  env: Env,
  owner: string,
  path: string
): Promise<Response | null> {
  const match = /^\/v1\/submissions\/([\w-]+)\/feedback$/.exec(path);
  if (!match) return null;
  const submission = await submissionAccess(env, owner, match[1]);
  if (!submission.submitted_at) fail(400, "INVALID_INPUT", "提交审核后可发送站内反馈");
  if (request.method === "GET") {
    const cursor = new URL(request.url).searchParams.get("cursor");
    let after: { time: string; id: string } | null = null;
    if (cursor) {
      try {
        after = JSON.parse(atob(cursor));
        if (!after || typeof after.time !== "string" || typeof after.id !== "string")
          throw new Error();
      } catch {
        fail(400, "INVALID_INPUT", "反馈游标无效");
      }
    }
    const rows = await env.DB.prepare(
      "SELECT f.*,p.login FROM submission_feedback f JOIN publishers p ON p.id=f.publisher_id WHERE submission_id=? AND (? IS NULL OR created_at>? OR (created_at=? AND f.id>?)) ORDER BY created_at,f.id LIMIT 51"
    )
      .bind(
        submission.id,
        after?.time ?? null,
        after?.time ?? null,
        after?.time ?? null,
        after?.id ?? null
      )
      .all<Row>();
    const last = rows.results[49];
    return json({
      items: rows.results.slice(0, 50).map(dto),
      nextCursor:
        rows.results.length > 50
          ? btoa(JSON.stringify({ time: last.created_at, id: last.id }))
          : null,
    });
  }
  if (request.method === "POST") {
    const input = await body(request);
    if (typeof input.message !== "string" || !input.message.trim() || input.message.length > 4000)
      fail(400, "INVALID_INPUT", "反馈内容必须为1至4000字");
    if (
      typeof input.clientRequestId !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(input.clientRequestId)
    )
      fail(400, "INVALID_INPUT", "需要请求编号UUID");
    await env.DB.prepare(
      "INSERT OR IGNORE INTO submission_feedback(id,submission_id,publisher_id,client_request_id,role,message,created_at) VALUES (?,?,?,?,?,?,?)"
    )
      .bind(
        crypto.randomUUID(),
        submission.id,
        owner,
        input.clientRequestId,
        owner === submission.publisher_id ? "author" : "reviewer",
        input.message.trim(),
        new Date().toISOString()
      )
      .run();
    const row = await env.DB.prepare(
      "SELECT f.*,p.login FROM submission_feedback f JOIN publishers p ON p.id=f.publisher_id WHERE submission_id=? AND publisher_id=? AND client_request_id=?"
    )
      .bind(submission.id, owner, input.clientRequestId)
      .first<Row>();
    if (!row) fail(503, "SERVICE_UNAVAILABLE", "发送失败，请重试");
    return json(dto(row), 201);
  }
  return null;
}
