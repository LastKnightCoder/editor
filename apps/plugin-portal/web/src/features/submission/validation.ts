import { LIMITS, type Listing, type UploadKind } from "../../../../contracts";

export type TextField =
  "summary" | "description" | "changelog" | "repository" | "commit" | "supportUrl";
export type FieldErrors = Partial<Record<TextField, string>>;

export const TEXT_LIMITS: Record<TextField, number> = {
  summary: LIMITS.summary,
  description: LIMITS.description,
  changelog: LIMITS.changelog,
  repository: 300,
  commit: 40,
  supportUrl: 2000,
};

export const FIELD_LABELS: Record<TextField, string> = {
  summary: "一句话简介",
  description: "详细介绍",
  changelog: "更新说明",
  repository: "源码仓库",
  commit: "Commit SHA",
  supportUrl: "反馈地址",
};

const REPOSITORY = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/;
const COMMIT = /^[a-f0-9]{40}$/i;

export const normalizeRepository = (value: string) => value.trim().replace(/\/+$/, "");
export const normalizeCommit = (value: string) => value.trim().toLowerCase();

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** 已填写但格式不对或超长：保存前就提示（空值留给提交检查） */
export function formatErrors(listing: Listing): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of Object.keys(TEXT_LIMITS) as TextField[]) {
    if (listing[field].length > TEXT_LIMITS[field]) {
      errors[field] = `不能超过 ${TEXT_LIMITS[field]} 字`;
    }
  }
  const { repository, commit, supportUrl } = listing;
  if (repository.trim() && !errors.repository && !REPOSITORY.test(repository.trim())) {
    errors.repository = "格式应为 https://github.com/owner/repo";
  }
  if (commit.trim() && !COMMIT.test(commit.trim())) {
    errors.commit = "需要 40 位完整 commit SHA";
  }
  if (supportUrl.trim() && !errors.supportUrl && !isHttpsUrl(supportUrl.trim())) {
    errors.supportUrl = "需要 HTTPS 地址";
  }
  return errors;
}

/** 提交要求：全部文本字段必填且格式正确 */
export function submitFieldErrors(listing: Listing): FieldErrors {
  const errors = formatErrors(listing);
  for (const field of Object.keys(TEXT_LIMITS) as TextField[]) {
    if (!errors[field] && !listing[field].trim()) errors[field] = "必填";
  }
  return errors;
}

export const ACCEPT: Record<UploadKind, string> = {
  package: ".zip,application/zip",
  icon: "image/png,image/jpeg,image/webp",
  screenshot: "image/png,image/jpeg,image/webp",
};

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp)$/i;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 上传前的本地预检，只为尽早提示；最终以服务端静态校验为准 */
export function precheckFile(
  kind: UploadKind,
  file: { name: string; size: number; type: string }
): string | null {
  if (file.size === 0) return "文件为空";
  if (kind === "package") {
    if (!/\.zip$/i.test(file.name)) return "插件包需要 .zip 文件";
    if (file.size > LIMITS.zipBytes) return `插件包不能超过 ${formatBytes(LIMITS.zipBytes)}`;
    return null;
  }
  if (!IMAGE_TYPES.has(file.type) && !IMAGE_EXTENSIONS.test(file.name)) {
    return "图片只支持 PNG、JPEG、WebP";
  }
  if (file.size > LIMITS.imageBytes) return `图片不能超过 ${formatBytes(LIMITS.imageBytes)}`;
  return null;
}

/** 服务端 fields 的键可能带 listing. 前缀，统一映射到表单字段 */
export function mapServerFields(fields: Record<string, string> | undefined): FieldErrors {
  const errors: FieldErrors = {};
  for (const [key, message] of Object.entries(fields ?? {})) {
    const field = key.replace(/^listing\./, "") as TextField;
    if (field in TEXT_LIMITS) errors[field] = message;
  }
  return errors;
}

export interface CheckItem {
  key: "package" | "icon" | "intro" | "source" | "support" | "uploads" | "saved";
  label: string;
  ok: boolean;
}

/** 提交前检查清单：全部通过才允许提交 */
export function submitChecklist(input: {
  listing: Listing;
  hasPackage: boolean;
  packageReady: boolean;
  uploading: boolean;
  dirty: boolean;
}): CheckItem[] {
  const errors = submitFieldErrors(input.listing);
  return [
    { key: "package", label: "插件包已通过静态校验", ok: input.hasPackage && input.packageReady },
    { key: "icon", label: "已上传图标", ok: !!input.listing.iconUploadId },
    {
      key: "intro",
      label: "简介、详细介绍与更新说明已填写",
      ok: !errors.summary && !errors.description && !errors.changelog,
    },
    { key: "source", label: "源码仓库与 commit 有效", ok: !errors.repository && !errors.commit },
    { key: "support", label: "反馈地址有效", ok: !errors.supportUrl },
    { key: "uploads", label: "没有进行中的上传", ok: !input.uploading },
    { key: "saved", label: "修改已全部保存", ok: !input.dirty },
  ];
}
