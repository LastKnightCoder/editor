export const LIMITS = {
  zipBytes: 8 * 1024 * 1024,
  expandedBytes: 32 * 1024 * 1024,
  imageBytes: 2 * 1024 * 1024,
  screenshots: 5,
  summary: 160,
  description: 20000,
  changelog: 10000,
} as const;

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "REVISION_CONFLICT"
  | "SUBMISSION_LOCKED"
  | "VERSION_ALREADY_SUBMITTED"
  | "PLUGIN_OWNERSHIP_CONFLICT"
  | "UPLOAD_STATE_CONFLICT"
  | "UPLOAD_EXPIRED"
  | "LIMIT_EXCEEDED"
  | "UPLOAD_TOO_LARGE"
  | "INVALID_PACKAGE"
  | "INVALID_IMAGE"
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
}
export type UploadKind = "package" | "icon" | "screenshot";
export type UploadStatus = "awaiting_upload" | "checking" | "ready" | "invalid";
export interface Upload {
  id: string;
  kind: UploadKind;
  status: UploadStatus;
  fileName: string;
  size: number;
  sha256: string | null;
  manifest: PackageManifest | null;
  error: { code: ErrorCode; message: string } | null;
  createdAt: string;
}
export interface CreateUpload {
  kind: UploadKind;
  fileName: string;
  size: number;
}
export interface UploadTicket {
  upload: Upload;
  uploadUrl: string;
  method: "PUT";
  headers: { "Content-Type": "application/octet-stream" };
}
export interface Listing {
  summary: string;
  description: string;
  repository: string;
  commit: string;
  changelog: string;
  supportUrl: string;
  iconUploadId: string | null;
  screenshotUploadIds: string[];
}
export type SubmissionStatus = "draft" | "pending_review";
export interface Submission {
  id: string;
  revision: number;
  status: SubmissionStatus;
  packageUploadId: string | null;
  manifest: PackageManifest | null;
  listing: Listing;
  repositoryId: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
}
export interface SaveSubmission {
  revision: number;
  packageUploadId: string | null;
  listing: Listing;
}
export interface SubmissionPage {
  items: Submission[];
  nextCursor: string | null;
}
export const emptyListing = (): Listing => ({
  summary: "",
  description: "",
  repository: "",
  commit: "",
  changelog: "",
  supportUrl: "",
  iconUploadId: null,
  screenshotUploadIds: [],
});
