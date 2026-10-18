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
  pluginId: string;
  name: string;
  description: string;
  publisher: PublicPublisher;
  repository: string;
  latest: CatalogVersion;
  /** 当前客户端可安装的最高版本；没有兼容版本时为 null，不回退到 latest。 */
  compatible: CatalogVersion | null;
}
export interface Catalog {
  items: CatalogEntry[];
  nextCursor: string | null;
  windowStart: string;
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
export interface ReviewDetails {
  reviews: ReviewRecord[];
  release: Release | null;
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
}
export interface SaveSubmission {
  revision: number;
  packageUploadId: string | null;
  repository: string;
}
export interface SubmissionPage {
  items: Submission[];
  nextCursor: string | null;
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
