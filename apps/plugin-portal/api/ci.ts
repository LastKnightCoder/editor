import { LIMITS, type CiRelease, type PackageContent } from "../contracts";
import { fail, isReviewer, json, readLimited, sha256, type Env } from "./platform";
import { inspectPackage } from "./package";
import { decideSubmission } from "./reviews";
import type { SubmissionRow } from "./submissions";
import { getRelease, releaseDto } from "./releases";

const ISSUER = "https://token.actions.githubusercontent.com";
const CLOCK_SKEW_SECONDS = 60;

/** GitHub Actions OIDC 令牌中本接口依赖的声明。 */
export interface ActionsClaims {
  iss: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  iat: number;
  repository: string;
  repository_id: string;
  repository_visibility: string;
  actor_id: string;
  ref: string;
  ref_type: string;
  sha: string;
}

let keyCache: { keys: Map<string, CryptoKey>; fetchedAt: number } | null = null;

async function signingKey(kid: string): Promise<CryptoKey> {
  const cached = keyCache?.keys.get(kid);
  if (cached) return cached;
  // 未知 kid 视为轮换，最多每分钟重新拉取一次，避免伪造令牌放大请求。
  if (keyCache && Date.now() - keyCache.fetchedAt < 60_000)
    fail(401, "UNAUTHENTICATED", "CI 身份令牌无效");
  let jwks: { keys?: (JsonWebKey & { kid?: string })[] };
  try {
    const response = await fetch(`${ISSUER}/.well-known/jwks`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error();
    jwks = await response.json();
  } catch {
    return fail(503, "GITHUB_UNAVAILABLE", "暂时无法校验 GitHub Actions 身份，请重跑任务");
  }
  const keys = new Map<string, CryptoKey>();
  for (const jwk of jwks.keys ?? []) {
    if (!jwk.kid || jwk.kty !== "RSA") continue;
    keys.set(
      jwk.kid,
      await crypto.subtle.importKey(
        "jwk",
        { kty: jwk.kty, n: jwk.n, e: jwk.e },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      )
    );
  }
  keyCache = { keys, fetchedAt: Date.now() };
  return keys.get(kid) ?? fail(401, "UNAUTHENTICATED", "CI 身份令牌无效");
}

/** 测试切换签发密钥时清空缓存。 */
export const resetActionsKeyCache = () => {
  keyCache = null;
};

const decodePart = (part: string) =>
  Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

export async function verifyActionsToken(token: string, audience: string): Promise<ActionsClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) fail(401, "UNAUTHENTICATED", "CI 身份令牌无效");
  let header: { alg?: string; kid?: string };
  let claims: ActionsClaims;
  try {
    header = JSON.parse(new TextDecoder().decode(decodePart(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decodePart(parts[1])));
  } catch {
    return fail(401, "UNAUTHENTICATED", "CI 身份令牌无效");
  }
  if (header.alg !== "RS256" || !header.kid) fail(401, "UNAUTHENTICATED", "CI 身份令牌无效");
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    await signingKey(header.kid),
    decodePart(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) fail(401, "UNAUTHENTICATED", "CI 身份令牌无效");
  const now = Date.now() / 1000;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    claims.iss !== ISSUER ||
    !audiences.includes(audience) ||
    !(claims.exp > now - CLOCK_SKEW_SECONDS) ||
    (claims.nbf ?? claims.iat) > now + CLOCK_SKEW_SECONDS
  )
    fail(401, "UNAUTHENTICATED", "CI 身份令牌已过期或不属于本门户");
  return claims;
}

/**
 * CI 发布：tag 触发的 GitHub Actions 凭 OIDC 令牌提交新版本，仓库身份即授权。
 * 首次发布须经网页提交绑定仓库；推送者本人即审核者时自动批准，其余进入待审。
 */
export async function ciRoute(request: Request, env: Env, path: string): Promise<Response | null> {
  if (path !== "/v1/ci/releases" || request.method !== "POST") return null;
  const bearer = /^Bearer (\S+)$/.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!bearer) fail(401, "UNAUTHENTICATED", "缺少 CI 身份令牌");
  const claims = await verifyActionsToken(bearer, env.API_ORIGIN);
  if (claims.ref_type !== "tag" || !claims.ref.startsWith("refs/tags/"))
    fail(403, "REPOSITORY_NOT_ALLOWED", "只接受由 tag 触发的发布");
  if (claims.repository_visibility !== "public")
    fail(403, "REPOSITORY_NOT_ALLOWED", "只接受公开仓库的发布");
  if (!/^[a-f0-9]{40}$/i.test(claims.sha)) fail(401, "UNAUTHENTICATED", "CI 身份令牌缺少提交");

  const bytes = await readLimited(request, LIMITS.zipBytes);
  const content: PackageContent = await inspectPackage(bytes);
  const { manifest } = content;
  const tag = claims.ref.slice("refs/tags/".length);
  if (tag !== manifest.version && tag !== `v${manifest.version}`)
    fail(400, "INVALID_INPUT", `tag ${tag} 与 manifest 版本 ${manifest.version} 不一致`);

  const plugin = await env.DB.prepare(
    "SELECT publisher_id,repository_id,repository FROM plugins WHERE id=?"
  )
    .bind(manifest.id)
    .first<{ publisher_id: string; repository_id: string; repository: string }>();
  if (!plugin) fail(404, "NOT_FOUND", "插件尚未在门户首次提交，请先在网页完成一次提交以绑定仓库");
  if (plugin.repository_id !== String(claims.repository_id))
    fail(409, "PLUGIN_OWNERSHIP_CONFLICT", "该插件 ID 已绑定其他仓库");
  const owner = plugin.publisher_id;
  const autoApprove = isReviewer(env, owner) && String(claims.actor_id) === owner;
  const hash = await sha256(bytes);

  let row = await env.DB.prepare(
    "SELECT * FROM submissions WHERE plugin_id=? AND plugin_version=? AND status IN ('pending_review','changes_requested','approved')"
  )
    .bind(manifest.id, manifest.version)
    .first<SubmissionRow>();
  if (row) {
    // 重跑同一 tag 是幂等的；同版本换了包内容必须提升版本号。
    const upload = await env.DB.prepare("SELECT sha256 FROM uploads WHERE id=?")
      .bind(row.package_upload_id)
      .first<{ sha256: string | null }>();
    if (upload?.sha256 !== hash)
      fail(409, "VERSION_ALREADY_SUBMITTED", "该版本已有不同内容的提交，请提升版本号");
  } else {
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM uploads WHERE publisher_id=? AND created_at>?"
    )
      .bind(owner, new Date(Date.now() - 86400000).toISOString())
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 100) fail(409, "LIMIT_EXCEEDED", "今日上传次数已达上限，请明天再试");
    const uploadId = crypto.randomUUID(),
      submissionId = crypto.randomUUID(),
      objectKey = `${owner}/${uploadId}`,
      time = new Date().toISOString(),
      snapshot = JSON.stringify(content);
    await env.PENDING.put(objectKey, bytes, { httpMetadata: { contentType: "application/zip" } });
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO uploads(id,publisher_id,status,file_name,size,object_key,sha256,content_json,created_at) VALUES (?,?,'ready',?,?,?,?,?,?)"
        ).bind(
          uploadId,
          owner,
          `${manifest.id}-${manifest.version}.zip`,
          bytes.length,
          objectKey,
          hash,
          snapshot,
          time
        ),
        env.DB.prepare(
          "INSERT INTO submissions(id,publisher_id,client_request_id,status,package_upload_id,content_json,repository,source_commit,repository_id,plugin_id,plugin_version,created_at,updated_at,submitted_at) VALUES (?,?,?,'pending_review',?,?,?,?,?,?,?,?,?,?)"
        ).bind(
          submissionId,
          owner,
          `ci:${submissionId}`,
          uploadId,
          snapshot,
          plugin.repository,
          claims.sha,
          plugin.repository_id,
          manifest.id,
          manifest.version,
          time,
          time,
          time
        ),
      ]);
    } catch (error) {
      await env.PENDING.delete(objectKey);
      if (String(error).includes("UNIQUE constraint failed"))
        fail(409, "VERSION_ALREADY_SUBMITTED", "该版本正在由另一次任务提交，请稍后重跑");
      throw error;
    }
    row = await env.DB.prepare("SELECT * FROM submissions WHERE id=?")
      .bind(submissionId)
      .first<SubmissionRow>();
    if (!row) fail(503, "SERVICE_UNAVAILABLE", "提交写入失败，请重跑任务");
  }

  if (autoApprove && row.status === "pending_review") {
    await decideSubmission(env, row, owner, row.revision, "approve", "CI 自动批准：推送者为审核者");
    row = (await env.DB.prepare("SELECT * FROM submissions WHERE id=?")
      .bind(row.id)
      .first<SubmissionRow>()) as SubmissionRow;
  }
  const release = await getRelease(env, row.id);
  return json<CiRelease>(
    {
      pluginId: manifest.id,
      version: manifest.version,
      submissionId: row.id,
      status: row.status as CiRelease["status"],
      autoApproved: autoApprove,
      release: release ? releaseDto(release, env) : null,
    },
    201
  );
}
