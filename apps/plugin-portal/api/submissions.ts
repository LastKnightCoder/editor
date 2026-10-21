import type {
  PackageContent,
  Submission,
  SubmissionCounts,
  SubmissionEvent,
  SubmissionGroup,
  SubmissionGroups,
  SubmissionPage,
  SubmissionStatus,
  SubmissionSummary,
} from "../contracts";
import { body, fail, isReviewer, json, type Env } from "./platform";
import { readyUpload } from "./uploads";
import { verifyRepository } from "./github";

export interface SubmissionRow {
  id: string;
  publisher_id: string;
  revision: number;
  status: SubmissionStatus;
  package_upload_id: string | null;
  content_json: string | null;
  repository: string;
  source_commit: string | null;
  repository_id: string | null;
  plugin_id: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  /** 来自 plugins 左连接；未绑定插件或未禁用时为 null。 */
  disabled_at: string | null;
  disabled_reason: string | null;
}
/** 提交行统一带上所属插件的禁用状态；plugin_id 只在归属校验后写入，连接仍限定同一作者以防越权读取。 */
export const SUBMISSION_SELECT =
  "SELECT s.*,p.disabled_at,p.disabled_reason FROM submissions s LEFT JOIN plugins p ON p.id=s.plugin_id AND p.publisher_id=s.publisher_id";
const disabledOf = (row: { disabled_at: string | null; disabled_reason: string | null }) =>
  row.disabled_at ? { reason: row.disabled_reason ?? "", at: row.disabled_at } : null;
interface EventRow {
  submission_id: string;
  kind: SubmissionEvent["kind"];
  decision: SubmissionEvent["decision"];
  role: SubmissionEvent["role"];
  login: string;
  excerpt: string;
  created_at: string;
}
/** 仅限制尚未完成审核的提交，历史记录不占额度。 */
const MAX_UNFINISHED_SUBMISSIONS = 100;
const STATUSES: SubmissionStatus[] = [
  "draft",
  "pending_review",
  "changes_requested",
  "rejected",
  "approved",
];
const dto = (row: SubmissionRow, owner: string): Omit<Submission, "lastEvent"> => ({
  id: row.id,
  revision: row.revision,
  status: row.status,
  packageUploadId: row.package_upload_id,
  content: row.content_json ? JSON.parse(row.content_json) : null,
  repository: row.repository,
  commit: row.source_commit,
  repositoryId: row.repository_id,
  pluginId: row.plugin_id,
  disabled: disabledOf(row),
  owned: row.publisher_id === owner,
  canEdit:
    row.publisher_id === owner && (row.status === "draft" || row.status === "changes_requested"),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  submittedAt: row.submitted_at,
});
/** 每个提交最近一条审核记录或站内反馈；where 作用于提交表别名 s，两段子查询各绑定一次。 */
async function latestEvents(
  env: Env,
  where: string,
  binds: unknown[]
): Promise<Map<string, SubmissionEvent>> {
  // SQLite substr 按字符截取，避免把整段正文传回 Worker。
  const events = await env.DB.prepare(
    `SELECT submission_id,kind,decision,role,login,excerpt,created_at FROM (
      SELECT e.*,ROW_NUMBER() OVER (PARTITION BY submission_id ORDER BY created_at DESC,id DESC) AS position FROM (
        SELECT r.submission_id,r.id,'review' AS kind,r.decision,'reviewer' AS role,p.login,substr(r.comment,1,120) AS excerpt,r.created_at
        FROM submission_reviews r JOIN submissions s ON s.id=r.submission_id JOIN publishers p ON p.id=r.reviewer_id WHERE ${where}
        UNION ALL
        SELECT f.submission_id,f.id,'feedback',NULL,f.role,p.login,substr(f.message,1,120),f.created_at
        FROM submission_feedback f JOIN submissions s ON s.id=f.submission_id JOIN publishers p ON p.id=f.publisher_id WHERE ${where}
      ) e
    ) WHERE position=1`
  )
    .bind(...binds, ...binds)
    .all<EventRow>();
  return new Map(
    events.results.map(event => [
      event.submission_id,
      {
        kind: event.kind,
        decision: event.decision,
        role: event.role,
        login: event.login,
        excerpt: event.excerpt,
        createdAt: event.created_at,
      } satisfies SubmissionEvent,
    ])
  );
}
/** 批量附加最新动态：审核记录与站内反馈合并后按 created_at/id 取每个提交的最新一条。 */
export async function withLastEvents(
  env: Env,
  rows: SubmissionRow[],
  owner: string
): Promise<Submission[]> {
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const latest = await latestEvents(env, `s.id IN (${ids.map(() => "?").join(",")})`, ids);
  return rows.map(row => ({ ...dto(row, owner), lastEvent: latest.get(row.id) ?? null }));
}
interface SummaryRow {
  id: string;
  status: SubmissionStatus;
  group_id: string | null;
  name: string | null;
  version: string | null;
  has_package: number;
  disabled_at: string | null;
  disabled_reason: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
}
/** 本人全部提交按插件归组，只读取摘要，不读包内正文。 */
async function submissionGroups(env: Env, owner: string): Promise<SubmissionGroups> {
  // 归组键优先取预绑定/已提交的 plugin_id，否则取包内 manifest.id；禁用状态只认本人登记的插件。
  const [rows, latest] = await Promise.all([
    env.DB.prepare(
      `SELECT s.id,s.status,COALESCE(s.plugin_id,json_extract(s.content_json,'$.manifest.id')) AS group_id,
        json_extract(s.content_json,'$.manifest.name') AS name,json_extract(s.content_json,'$.manifest.version') AS version,
        s.package_upload_id IS NOT NULL AS has_package,p.disabled_at,p.disabled_reason,
        s.created_at,s.updated_at,s.submitted_at
      FROM submissions s LEFT JOIN plugins p ON p.id=COALESCE(s.plugin_id,json_extract(s.content_json,'$.manifest.id')) AND p.publisher_id=s.publisher_id
      WHERE s.publisher_id=? ORDER BY s.created_at DESC,s.id DESC`
    )
      .bind(owner)
      .all<SummaryRow>(),
    latestEvents(env, "s.publisher_id=?", [owner]),
  ]);
  const groups = new Map<string | null, SubmissionGroup>();
  const activity = new Map<string | null, string>();
  for (const row of rows.results) {
    const summary: SubmissionSummary = {
      id: row.id,
      status: row.status,
      pluginId: row.group_id,
      name: row.name,
      version: row.version,
      hasPackage: !!row.has_package,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      submittedAt: row.submitted_at,
      lastEvent: latest.get(row.id) ?? null,
    };
    const group = groups.get(row.group_id) ?? {
      pluginId: row.group_id,
      name: null,
      disabled: disabledOf(row),
      submissions: [],
    };
    group.name ??= row.name;
    group.submissions.push(summary);
    groups.set(row.group_id, group);
    const eventTime = summary.lastEvent?.createdAt ?? "";
    const time = eventTime > row.updated_at ? eventTime : row.updated_at;
    if (time > (activity.get(row.group_id) ?? "")) activity.set(row.group_id, time);
  }
  return {
    groups: [...groups.values()].sort((a, b) =>
      (activity.get(b.pluginId) ?? "").localeCompare(activity.get(a.pluginId) ?? "")
    ),
  };
}
const present = async (env: Env, row: SubmissionRow, owner: string) =>
  (await withLastEvents(env, [row], owner))[0];
export async function submissionAccess(
  env: Env,
  owner: string,
  id: string
): Promise<SubmissionRow> {
  const row = await env.DB.prepare(
    `${SUBMISSION_SELECT} WHERE s.id=? AND (s.publisher_id=? OR (?=1 AND s.submitted_at IS NOT NULL))`
  )
    .bind(id, owner, isReviewer(env, owner) ? 1 : 0)
    .first<SubmissionRow>();
  if (!row) fail(404, "NOT_FOUND", "找不到提交记录");
  return row;
}
export async function submissionRoute(
  request: Request,
  env: Env,
  owner: string,
  token: () => Promise<string>,
  path: string
): Promise<Response | null> {
  if (path === "/v1/submissions" && request.method === "POST") {
    const input = await body(request);
    if (
      typeof input.clientRequestId !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(input.clientRequestId)
    )
      fail(400, "INVALID_INPUT", "需要请求编号UUID");
    const byRequest = () =>
      env.DB.prepare(`${SUBMISSION_SELECT} WHERE s.publisher_id=? AND s.client_request_id=?`)
        .bind(owner, input.clientRequestId)
        .first<SubmissionRow>();
    if (typeof input.packageUploadId !== "string" || !input.packageUploadId)
      fail(400, "INVALID_INPUT", "请先上传并校验插件包");
    if (
      input.pluginId !== undefined &&
      (typeof input.pluginId !== "string" || !/^[\w.-]{1,128}$/.test(input.pluginId))
    )
      fail(400, "INVALID_INPUT", "插件ID无效");
    const existing = await byRequest();
    if (existing) {
      // 幂等只对同一次操作的重试成立；同编号换了包说明客户端状态已错位，不能静默返回旧草稿。
      if (existing.package_upload_id !== input.packageUploadId)
        fail(409, "REVISION_CONFLICT", "该请求编号已用于创建另一个草稿，请刷新后重试");
      return json(await present(env, existing, owner));
    }
    const count = await env.DB.prepare(
      "SELECT count(*) AS n FROM submissions WHERE publisher_id=? AND status IN ('draft','pending_review','changes_requested')"
    )
      .bind(owner)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_UNFINISHED_SUBMISSIONS)
      fail(
        409,
        "LIMIT_EXCEEDED",
        `未完成的提交已达 ${MAX_UNFINISHED_SUBMISSIONS} 条上限（草稿、待审核、要求修改）。请先删除不需要且允许删除的草稿，或等待审核完成；已批准、已拒绝的历史记录不占额度。`
      );
    const upload = await readyUpload(env, owner, input.packageUploadId);
    if (!upload.content_json) fail(409, "UPLOAD_NOT_READY", "插件包资料尚未就绪");
    const manifestId = (JSON.parse(upload.content_json) as PackageContent).manifest.id;
    // 「发布新版本」预绑定目标插件：必须是本人登记的插件，且包就是它的；其他情况仓库地址仍按包内 ID 带入。
    const target = input.pluginId
      ? await env.DB.prepare("SELECT id,repository FROM plugins WHERE id=? AND publisher_id=?")
          .bind(input.pluginId, owner)
          .first<{ id: string; repository: string }>()
      : null;
    if (input.pluginId && !target) fail(404, "NOT_FOUND", "插件不存在或不属于当前账号");
    if (target && manifestId !== target.id)
      fail(400, "INVALID_INPUT", `插件包的 manifest.id 不是 ${target.id}，请为它重新打包`, {
        packageUploadId: `需要 ${target.id} 的插件包`,
      });
    const known =
      target ??
      (await env.DB.prepare("SELECT repository FROM plugins WHERE id=? AND publisher_id=?")
        .bind(manifestId, owner)
        .first<{ repository: string }>());
    const time = new Date().toISOString();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO submissions(id,publisher_id,client_request_id,package_upload_id,content_json,repository,plugin_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
    )
      .bind(
        crypto.randomUUID(),
        owner,
        input.clientRequestId,
        upload.id,
        upload.content_json,
        known?.repository ?? "",
        target?.id ?? null,
        time,
        time
      )
      .run();
    const row = await byRequest();
    if (!row) fail(503, "SERVICE_UNAVAILABLE", "创建失败，请使用同一请求编号重试");
    return json(await present(env, row, owner), 201);
  }
  if (path === "/v1/submission-groups" && request.method === "GET")
    return json(await submissionGroups(env, owner));
  if (path === "/v1/submissions" && request.method === "GET") {
    const url = new URL(request.url),
      review = url.searchParams.get("scope") === "review";
    if (review && !isReviewer(env, owner)) fail(403, "FORBIDDEN", "仅审核者可查看待审队列");
    const status = url.searchParams.get("status") as SubmissionStatus | null;
    if (status !== null && !STATUSES.includes(status)) fail(400, "INVALID_INPUT", "状态筛选无效");
    let after: { time: string; id: string } | null = null;
    const cursor = url.searchParams.get("cursor");
    if (cursor) {
      try {
        after = JSON.parse(atob(cursor));
        if (
          !after ||
          typeof after.time !== "string" ||
          !Number.isFinite(Date.parse(after.time)) ||
          typeof after.id !== "string"
        )
          throw new Error();
      } catch {
        fail(400, "INVALID_INPUT", "分页游标无效");
      }
    }
    const scope = review ? "s.submitted_at IS NOT NULL" : "s.publisher_id=?",
      scopeArgs = review ? [] : [owner];
    // counts 只按范围分组，不受 status 与游标影响，供筛选标签和侧栏待审数使用。
    const [rows, grouped] = await Promise.all([
      env.DB.prepare(
        `${SUBMISSION_SELECT} WHERE ${scope} AND (? IS NULL OR s.status=?) AND (? IS NULL OR s.created_at<? OR (s.created_at=? AND s.id<?)) ORDER BY s.created_at DESC,s.id DESC LIMIT 21`
      )
        .bind(
          ...scopeArgs,
          status,
          status,
          after?.time ?? null,
          after?.time ?? null,
          after?.time ?? null,
          after?.id ?? null
        )
        .all<SubmissionRow>(),
      env.DB.prepare(
        `SELECT s.status,COUNT(*) AS n FROM submissions s WHERE ${scope} GROUP BY s.status`
      )
        .bind(...scopeArgs)
        .all<{ status: SubmissionStatus; n: number }>(),
    ]);
    const counts = Object.fromEntries(STATUSES.map(key => [key, 0])) as SubmissionCounts;
    for (const row of grouped.results) counts[row.status] = row.n;
    const last = rows.results[19];
    return json<SubmissionPage>({
      items: await withLastEvents(env, rows.results.slice(0, 20), owner),
      nextCursor:
        rows.results.length > 20
          ? btoa(JSON.stringify({ time: last.created_at, id: last.id }))
          : null,
      counts,
    });
  }
  const match = /^\/v1\/submissions\/([\w-]+)(\/submit|\/withdraw)?$/.exec(path);
  if (!match) return null;
  const action = match[2] ?? "";
  const row = await submissionAccess(env, owner, match[1]),
    current = dto(row, owner);
  if (!action && request.method === "GET") return json(await present(env, row, owner));
  if (row.publisher_id !== owner) fail(403, "FORBIDDEN", "不能修改其他作者的提交");
  const latestRow = () => submissionAccess(env, owner, row.id),
    latest = async () => dto(await latestRow(), owner),
    respondLatest = async () => json(await present(env, await latestRow(), owner));
  if (!action && request.method === "DELETE") {
    // 审核记录属于平台审计：曾被要求修改、再撤回的草稿不可删，只删从未进入审核的草稿；上传记录与待审对象保留。
    const deletable =
      "id=? AND publisher_id=? AND status='draft' AND NOT EXISTS(SELECT 1 FROM submission_reviews WHERE submission_id=submissions.id)";
    const result = await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM submission_feedback WHERE submission_id=? AND EXISTS(SELECT 1 FROM submissions WHERE ${deletable})`
      ).bind(row.id, row.id, owner),
      env.DB.prepare(`DELETE FROM submissions WHERE ${deletable}`).bind(row.id, owner),
    ]);
    if (!result[1].meta.changes) fail(409, "SUBMISSION_LOCKED", "只有未进入审核的草稿可以删除");
    return json({ deleted: true });
  }
  if (action === "/withdraw" && request.method === "POST") {
    const input = await body(request);
    if (current.status === "draft") return json(await present(env, row, owner));
    if (current.status !== "pending_review")
      fail(409, "SUBMISSION_LOCKED", "只有审核中的提交可以撤回");
    if (input.revision !== row.revision)
      fail(409, "REVISION_CONFLICT", "记录已变化，请重新读取后撤回");
    // 保留 submitted_at 与 plugin_id：反馈线程继续可用，审核者仍能追踪，换包仍受插件 ID 约束。
    const result = await env.DB.prepare(
      "UPDATE submissions SET status='draft',revision=revision+1,updated_at=? WHERE id=? AND publisher_id=? AND status='pending_review' AND revision=?"
    )
      .bind(new Date().toISOString(), row.id, owner, row.revision)
      .run();
    if (!result.meta.changes) {
      const value = await latest();
      if (value.status === "draft") return respondLatest();
      fail(409, "REVISION_CONFLICT", "记录已被审核或已变化，请重新读取");
    }
    return respondLatest();
  }
  if (!action && request.method === "PATCH") {
    const input = await body(request);
    if (!current.canEdit) fail(409, "SUBMISSION_LOCKED", "该记录已提交，内容只读");
    if (input.revision !== row.revision)
      fail(409, "REVISION_CONFLICT", "草稿已变化，请重新读取后确认");
    if (
      typeof input.repository !== "string" ||
      input.repository.length > 300 ||
      (input.repository && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(input.repository))
    )
      fail(400, "INVALID_INPUT", "请填写有效的GitHub仓库地址", {
        repository: "格式为 https://github.com/作者/仓库",
      });
    if (input.packageUploadId !== null && typeof input.packageUploadId !== "string")
      fail(400, "INVALID_INPUT", "插件包引用无效");
    const upload = input.packageUploadId
      ? await readyUpload(env, owner, input.packageUploadId)
      : null;
    const content = upload?.content_json ? JSON.parse(upload.content_json) : null;
    if (row.plugin_id && content && content.manifest.id !== row.plugin_id)
      fail(400, "INVALID_INPUT", `这条提交属于插件 ${row.plugin_id}，不能换成其他插件的包`, {
        packageUploadId: "请为其他插件新建提交",
      });
    const known = content
      ? await env.DB.prepare("SELECT repository FROM plugins WHERE id=? AND publisher_id=?")
          .bind(content.manifest.id, owner)
          .first<{ repository: string }>()
      : null;
    const result = await env.DB.prepare(
      "UPDATE submissions SET repository=?,package_upload_id=?,content_json=?,revision=revision+1,updated_at=? WHERE id=? AND publisher_id=? AND status IN ('draft','changes_requested') AND revision=?"
    )
      .bind(
        input.repository || known?.repository || "",
        input.packageUploadId,
        upload?.content_json ?? null,
        new Date().toISOString(),
        row.id,
        owner,
        row.revision
      )
      .run();
    if (!result.meta.changes) {
      const value = await latest();
      fail(
        409,
        value.canEdit ? "REVISION_CONFLICT" : "SUBMISSION_LOCKED",
        "记录已变化，请重新读取"
      );
    }
    return respondLatest();
  }
  if (action === "/submit" && request.method === "POST") {
    const input = await body(request);
    if (current.status === "pending_review") return json(await present(env, row, owner));
    if (!current.canEdit) fail(409, "SUBMISSION_LOCKED", "该提交已结束，不能重新提交");
    if (input.revision !== row.revision)
      fail(409, "REVISION_CONFLICT", "草稿已变化，请重新读取后提交");
    if (!current.packageUploadId || !current.content)
      fail(400, "INVALID_INPUT", "请先上传插件包并保存");
    if (!current.repository)
      fail(400, "INVALID_INPUT", "首次提交需关联源码仓库", { repository: "请填写源码仓库" });
    await readyUpload(env, owner, current.packageUploadId);
    const source = await verifyRepository(await token(), current.repository),
      manifest = current.content.manifest,
      time = new Date().toISOString();
    try {
      const result = await env.DB.batch([
        env.DB.prepare(
          "INSERT OR IGNORE INTO plugins(id,publisher_id,repository_id,repository) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM submissions WHERE id=? AND publisher_id=? AND status IN ('draft','changes_requested') AND revision=?)"
        ).bind(manifest.id, owner, source.id, current.repository, row.id, owner, row.revision),
        env.DB.prepare(
          "UPDATE submissions SET status='pending_review',plugin_id=?,plugin_version=?,repository_id=?,source_commit=?,submitted_at=?,updated_at=?,revision=revision+1 WHERE id=? AND publisher_id=? AND revision=? AND status IN ('draft','changes_requested') AND EXISTS(SELECT 1 FROM plugins WHERE id=? AND publisher_id=? AND repository_id=?)"
        ).bind(
          manifest.id,
          manifest.version,
          source.id,
          source.commit,
          time,
          time,
          row.id,
          owner,
          row.revision,
          manifest.id,
          owner,
          source.id
        ),
      ]);
      if (!result[1].meta.changes) {
        const value = await latestRow();
        if (value.status === "pending_review") return json(await present(env, value, owner));
        if (value.revision !== row.revision)
          fail(409, "REVISION_CONFLICT", "草稿已变化，请重新读取");
        fail(409, "PLUGIN_OWNERSHIP_CONFLICT", "插件ID已属于其他作者或仓库");
      }
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed"))
        fail(409, "VERSION_ALREADY_SUBMITTED", "该版本已有待审记录，请查看我的提交");
      throw error;
    }
    return respondLatest();
  }
  return null;
}
