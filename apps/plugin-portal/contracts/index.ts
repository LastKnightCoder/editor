import type { PluginCategory } from "@tau/plugins/package";

export type { PluginCategory };

export const LIMITS = {
  zipBytes: 8 * 1024 * 1024,
  expandedBytes: 32 * 1024 * 1024,
  summary: 160,
  readmeBytes: 128 * 1024,
} as const;

export type ErrorCode =
  | "COMMENT_REQUEST_CONFLICT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "REVISION_CONFLICT"
  | "SUBMISSION_LOCKED"
  | "VERSION_ALREADY_SUBMITTED"
  | "PLUGIN_OWNERSHIP_CONFLICT"
  | "UPLOAD_STATE_CONFLICT"
  | "UPLOAD_EXPIRED"
  | "LIMIT_EXCEEDED"
  | "UPLOAD_TOO_LARGE"
  | "INVALID_PACKAGE"
  | "UPLOAD_NOT_READY"
  | "REPOSITORY_NOT_ALLOWED"
  | "GITHUB_UNAVAILABLE"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ApiError {
  error: { code: ErrorCode; message: string; fields?: Record<string, string>; requestId: string };
}
export interface ApiResult<T> {
  data: T;
}
export interface User {
  id: string;
  login: string;
  avatarUrl: string;
}
export interface Session {
  user: User | null;
  csrfToken: string | null;
  reviewer: boolean;
}
export interface PackageManifest {
  formatVersion: 1;
  apiVersion: 1;
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  platform: "desktop";
  format: "cjs";
  main: string;
  styles?: string;
  integrity: Record<string, string>;
  description: string;
  /** 作者自填的插件中心分类，上传时严格校验词表。 */
  categories?: readonly PluginCategory[];
  /** 仅参与目录搜索。 */
  keywords?: readonly string[];
}
export interface PackageContent {
  manifest: PackageManifest;
  readme: string;
  changelog: string | null;
}
export type UploadStatus = "awaiting_upload" | "checking" | "ready" | "invalid";
export interface Upload {
  id: string;
  status: UploadStatus;
  fileName: string;
  size: number;
  sha256: string | null;
  content: PackageContent | null;
  error: { code: ErrorCode; message: string } | null;
  createdAt: string;
}
export interface CreateUpload {
  fileName: string;
  size: number;
}
export interface UploadTicket {
  upload: Upload;
  uploadUrl: string;
  method: "PUT";
  headers: { "Content-Type": "application/octet-stream" };
}
export type SubmissionStatus =
  "draft" | "pending_review" | "changes_requested" | "rejected" | "approved";
export type ReviewDecision = "approve" | "request_changes" | "reject";
export interface ReviewRequest {
  revision: number;
  decision: ReviewDecision;
  comment: string;
}
export interface ReviewRecord {
  id: string;
  revision: number;
  packageUploadId: string;
  sha256: string;
  manifest: PackageManifest;
  repository: string;
  commit: string;
  reviewer: User;
  decision: ReviewDecision;
  comment: string;
  createdAt: string;
}
export interface Release {
  id: string;
  pluginId: string;
  version: string;
  state: "pending" | "publishing" | "published" | "failed";
  sha256: string;
  size: number;
  error: string | null;
  publishedAt: string | null;
  downloadUrl: string | null;
}
export type PublicPublisher = Pick<User, "login" | "avatarUrl">;
/** 匿名公开的已发布版本详情。 */
/** 已发布版本列表项：附带该版本 manifest，供版本历史与审核对比使用。 */
export interface ReleaseSummary extends Release {
  manifest: PackageManifest;
}
export interface ReleasePage {
  items: ReleaseSummary[];
  nextCursor: string | null;
}
export interface PublicRelease extends Release {
  content: PackageContent;
  repository: string;
  commit: string;
  publisher: PublicPublisher;
}
export interface CatalogVersion {
  releaseId: string;
  version: string;
  minAppVersion: string;
  publishedAt: string;
  size: number;
  sha256: string;
  downloadUrl: string;
}
/** 插件中心目录项：每个插件一条，资料取自最高已发布版本。 */
export interface CatalogEntry {
  downloadsTotal: number;
  downloads7d: number;
  /** 当前有效喜欢数，口径同 PluginCommunity.likes。 */
  likes: number;
  pluginId: string;
  name: string;
  description: string;
  publisher: PublicPublisher;
  repository: string;
  /** 取自 latest，作者未填写时为空数组。 */
  categories: PluginCategory[];
  /** 取自 latest，供客户端本地搜索；界面不作为标签展示。 */
  keywords: string[];
  latest: CatalogVersion;
  /** 当前客户端可安装的最高版本；没有兼容版本时为 null，不回退到 latest。 */
  compatible: CatalogVersion | null;
}
export interface Catalog {
  items: CatalogEntry[];
  nextCursor: string | null;
  windowStart: string;
  /** 各分类插件数，受 q 影响、不受 category 影响；仅首页返回，翻页为 null。 */
  categoryCounts: Partial<Record<PluginCategory, number>> | null;
}
export type CatalogSort = "downloads7d" | "downloadsTotal" | "updated";
export interface DownloadStatistics {
  downloadsTotal: number;
  downloads7d: number;
  windowStart: string;
}
export interface VisitorSession {
  visitorId: string;
  /** 仅无 Origin 的桌面申请返回，网页通过 HttpOnly Cookie 使用。 */
  token?: string;
}
/** POST /v1/ci/releases 的结果；autoApproved 为真时 release 随即发布。 */
export interface CiRelease {
  pluginId: string;
  version: string;
  submissionId: string;
  status: Extract<SubmissionStatus, "pending_review" | "changes_requested" | "approved">;
  autoApproved: boolean;
  release: Release | null;
}
export interface ReviewDetails {
  reviews: ReviewRecord[];
  release: Release | null;
}
/** 提交最近一条审核或站内反馈的摘要，列表据此显示「最新动态」。 */
export interface SubmissionEvent {
  kind: "review" | "feedback";
  /** kind=review 时为审核决定，feedback 为 null。 */
  decision: ReviewDecision | null;
  role: "author" | "reviewer";
  login: string;
  /** 正文前 120 个字符，审核通过且无意见时为空串。 */
  excerpt: string;
  createdAt: string;
}
export interface Submission {
  id: string;
  revision: number;
  status: SubmissionStatus;
  packageUploadId: string | null;
  content: PackageContent | null;
  repository: string;
  commit: string | null;
  canEdit: boolean;
  repositoryId: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  lastEvent: SubmissionEvent | null;
}
export interface SaveSubmission {
  revision: number;
  packageUploadId: string | null;
  repository: string;
}
/** 列表范围内各状态的条数，不受 status 筛选与分页影响。 */
export type SubmissionCounts = Record<SubmissionStatus, number>;
export interface SubmissionPage {
  items: Submission[];
  nextCursor: string | null;
  counts: SubmissionCounts;
}
/** 提交摘要：不含 README 等包内容，供按插件归组的列表使用。 */
export interface SubmissionSummary {
  id: string;
  status: SubmissionStatus;
  /** 包内插件 ID；还没上传包的草稿为 null。 */
  pluginId: string | null;
  name: string | null;
  version: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  lastEvent: SubmissionEvent | null;
}
/** 同一插件的全部提交，按创建时间倒序；pluginId 为 null 的一组是未上传包的草稿。 */
export interface SubmissionGroup {
  pluginId: string | null;
  name: string | null;
  submissions: SubmissionSummary[];
}
export interface SubmissionGroups {
  /** 按组内最近活动时间倒序。 */
  groups: SubmissionGroup[];
}
export interface SubmissionQuery {
  /** review 为审核范围（仅审核者），默认本人提交。 */
  scope: "mine" | "review";
  status: SubmissionStatus | null;
  cursor: string | null;
}
export interface FeedbackMessage {
  id: string;
  author: { id: string; login: string };
  role: "author" | "reviewer";
  message: string;
  createdAt: string;
}

export interface PluginComment {
  id: string;
  message: string;
  createdAt: string;
  canDelete: boolean;
  deleted: boolean;
}
export interface PluginCommunity {
  likes: number;
  liked: boolean;
  comments: PluginComment[];
  nextCursor: string | null;
}

export type ModerationAction = "delete_comment" | "suspend_visitor" | "restore_visitor";
export interface ModerationInput {
  commentId: string;
  action: ModerationAction;
  reason: string;
  revision: number;
  clientRequestId: string;
}
export interface ModerationComment {
  id: string;
  pluginId: string;
  visitorId: string;
  message: string;
  createdAt: string;
  deleted: boolean;
  suspended: boolean;
  visitorRevision: number;
}
export interface ModerationFilter {
  pluginId: string;
  visitorId: string;
  status: "visible" | "deleted" | "all";
}
export interface ModerationEvent {
  id: string;
  reviewer: string;
  commentId: string;
  visitorId: string;
  action: ModerationAction;
  reason: string;
  createdAt: string;
}
export interface ModerationPage<T> {
  items: T[];
  nextCursor: string | null;
}
