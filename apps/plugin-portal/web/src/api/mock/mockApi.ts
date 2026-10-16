import {
  LIMITS,
  emptyListing,
  type ErrorCode,
  type Listing,
  type Submission,
  type Upload,
  type UploadKind,
} from "../../../../contracts";
import { PortalApiError, abortedError, networkError } from "../errors";
import type { PortalApi, UploadTransfer } from "../types";
import { MOCK_USER, createSampleDb, sampleImageSvg, sampleManifest, type MockDb } from "./samples";

/** 模拟场景开关：由开发面板写入 localStorage，下一次请求即生效 */
export interface MockFlags {
  latencyMs: number;
  list: "normal" | "empty" | "error";
  /** 下一次需要登录的请求返回 401 并清除会话 */
  expireNextRequest: boolean;
  upload: "normal" | "network" | "invalid" | "server-error";
  slowUpload: boolean;
  /** 下一次保存前，模拟另一个窗口先保存了新版本 */
  conflictNextSave: boolean;
  /** network：服务端已完成提交，但响应在网络中丢失 */
  submit: "normal" | "repository" | "github" | "network";
}

export const DEFAULT_MOCK_FLAGS: MockFlags = {
  latencyMs: 350,
  list: "normal",
  expireNextRequest: false,
  upload: "normal",
  slowUpload: false,
  conflictNextSave: false,
  submit: "normal",
};

export interface MockTiming {
  /** 覆盖延迟（测试用），未给则取 flags.latencyMs */
  latencyMs?: number;
  uploadMs?: number;
  verifyMs?: number;
}

type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: key => void map.delete(key),
  };
}

const DB_KEY = "tau-portal:mock-db";
const FLAGS_KEY = "tau-portal:mock-flags";
const PAGE_SIZE = 20;

export interface MockController {
  getFlags(): MockFlags;
  setFlags(patch: Partial<MockFlags>): void;
  reset(): void;
  signIn(): void;
  isSignedIn(): boolean;
}

const fail = (
  status: number,
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>
): never => {
  throw new PortalApiError(status, code, message, { requestId: "mock", fields });
};

function manifestFromFileName(fileName: string) {
  const base = fileName.replace(/\.zip$/i, "");
  const match = /^(.*?)[-_]v?(\d+\.\d+\.\d+[\w.-]*)$/.exec(base);
  const id =
    (match?.[1] ?? base)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "plugin";
  return sampleManifest(id, id, match?.[2] ?? "0.1.0");
}

const randomHex = (length: number) =>
  Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function createMockApi(
  options: { storage?: KeyValueStorage; timing?: MockTiming; now?: () => Date } = {}
): { api: PortalApi; controller: MockController } {
  const storage = options.storage ?? memoryStorage();
  const now = () => (options.now ? options.now() : new Date());
  const images = new Map<string, Blob>();

  const load = (): MockDb => {
    try {
      const raw = storage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw) as MockDb;
    } catch {
      /* 损坏的模拟数据按样本重建 */
    }
    return createSampleDb(now());
  };
  let db = load();
  const persist = () => storage.setItem(DB_KEY, JSON.stringify(db));

  const getFlags = (): MockFlags => {
    try {
      return {
        ...DEFAULT_MOCK_FLAGS,
        ...(JSON.parse(storage.getItem(FLAGS_KEY) ?? "{}") as Partial<MockFlags>),
      };
    } catch {
      return DEFAULT_MOCK_FLAGS;
    }
  };
  const setFlags = (patch: Partial<MockFlags>) =>
    storage.setItem(FLAGS_KEY, JSON.stringify({ ...getFlags(), ...patch }));

  const latency = () => sleep(options.timing?.latencyMs ?? getFlags().latencyMs);

  /** 需要登录的请求：处理会话过期开关 */
  const owner = () => {
    if (getFlags().expireNextRequest) {
      setFlags({ expireNextRequest: false });
      db.user = null;
      persist();
    }
    if (!db.user) fail(401, "UNAUTHENTICATED", "登录已过期，请重新登录");
  };

  const findSubmission = (id: string) =>
    db.submissions.find(item => item.id === id) ?? fail(404, "NOT_FOUND", "找不到提交记录");
  const findUpload = (id: string) =>
    db.uploads.find(item => item.id === id) ?? fail(404, "NOT_FOUND", "找不到上传记录");
  const nextId = (prefix: string) => `${prefix}_${String(++db.seq).padStart(4, "0")}`;
  const clone = <T>(value: T): T => structuredClone(value);

  const readyRef = (id: string, kind: UploadKind) => {
    const upload = db.uploads.find(item => item.id === id);
    if (!upload || upload.kind !== kind || upload.status !== "ready") {
      fail(400, "UPLOAD_NOT_READY", "引用的文件未就绪或类型不符，请重新上传");
    }
  };

  const validateListing = (listing: Listing, complete: boolean) => {
    const limits = {
      summary: LIMITS.summary,
      description: LIMITS.description,
      changelog: LIMITS.changelog,
      repository: 300,
      commit: 40,
      supportUrl: 2000,
    };
    const labels = {
      summary: "简介",
      description: "详细介绍",
      changelog: "更新说明",
      repository: "源码仓库",
      commit: "源码提交",
      supportUrl: "反馈链接",
    };
    const fields: Record<string, string> = {};
    for (const [field, limit] of Object.entries(limits)) {
      const value = listing[field as keyof typeof limits];
      if (value.length > limit || (complete && !value.trim())) {
        fields[field] = `${labels[field as keyof typeof labels]}不能为空且不能超过 ${limit} 个字符`;
      }
    }
    if (Object.keys(fields).length) fail(400, "INVALID_INPUT", Object.values(fields)[0], fields);
    if (listing.screenshotUploadIds.length > LIMITS.screenshots)
      fail(400, "INVALID_INPUT", "截图最多 5 张");
    if (complete) {
      if (!listing.iconUploadId) fail(400, "INVALID_INPUT", "请上传插件图标");
      if (
        !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(listing.repository) ||
        !/^[a-f0-9]{40}$/i.test(listing.commit)
      ) {
        fail(400, "INVALID_INPUT", "仓库地址或完整 commit SHA 无效");
      }
      if (!listing.supportUrl.startsWith("https://"))
        fail(400, "INVALID_INPUT", "反馈链接必须为 HTTPS 地址");
    }
  };

  /** 服务端完成接收后的静态校验 */
  const finalizeUpload = (upload: Upload, file: Blob): PortalApiError | null => {
    const flags = getFlags();
    const invalid = (code: ErrorCode, message: string, status = 422) => {
      upload.status = "invalid";
      upload.error = { code, message };
      persist();
      return new PortalApiError(status, code, message, { requestId: "mock" });
    };
    if (flags.upload === "server-error")
      return invalid("SERVICE_UNAVAILABLE", "上传处理失败，请重新上传", 503);
    if (upload.kind === "package") {
      if (flags.upload === "invalid" || /invalid|bad/i.test(upload.fileName)) {
        return invalid(
          "INVALID_PACKAGE",
          "manifest.json 缺少 minAppVersion，或 integrity 与 main.js 不一致"
        );
      }
      upload.manifest = manifestFromFileName(upload.fileName);
    } else {
      if (flags.upload === "invalid")
        return invalid("INVALID_IMAGE", "仅支持 PNG、JPEG 和 WebP 图片");
      images.set(upload.id, file);
    }
    upload.status = "ready";
    upload.sha256 = randomHex(64);
    persist();
    return null;
  };

  function sendUpload(
    ticket: { upload: Upload },
    file: Blob,
    onProgress: (p: { loaded: number; total: number }) => void
  ): UploadTransfer {
    const flags = getFlags();
    const uploadMs = options.timing?.uploadMs ?? (flags.slowUpload ? 9000 : 1600);
    const verifyMs = options.timing?.verifyMs ?? (flags.slowUpload ? 5000 : 1200);
    const steps = 10;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let aborted = false;
    let sent = false;
    let rejectTransfer: (error: PortalApiError) => void = () => {};

    const result = new Promise<Upload>((resolve, reject) => {
      rejectTransfer = reject;
      try {
        owner();
      } catch (error) {
        reject(error);
        return;
      }
      const upload = db.uploads.find(item => item.id === ticket.upload.id);
      if (!upload || upload.status !== "awaiting_upload") {
        reject(
          new PortalApiError(409, "UPLOAD_STATE_CONFLICT", "上传正在处理或已经完成，请查询状态")
        );
        return;
      }
      let step = 0;
      const tick = () => {
        step += 1;
        if (flags.upload === "network" && step === 6) {
          reject(networkError());
          return;
        }
        onProgress({ loaded: Math.round((file.size * step) / steps), total: file.size });
        if (step < steps) {
          timer = setTimeout(tick, uploadMs / steps);
          return;
        }
        // 字节全部到达：服务端开始校验，此后取消不会撤销处理
        sent = true;
        upload.status = "checking";
        persist();
        setTimeout(() => {
          const error = finalizeUpload(upload, file);
          if (aborted) return;
          if (error) reject(error);
          else resolve(clone(upload));
        }, verifyMs);
      };
      timer = setTimeout(tick, uploadMs / steps);
    });

    return {
      result,
      abort() {
        if (aborted) return;
        aborted = true;
        if (!sent) clearTimeout(timer);
        rejectTransfer(abortedError());
      },
    };
  }

  const api: PortalApi = {
    githubLoginUrl: "/submissions?mock_login=1",

    async getSession() {
      await latency();
      return db.user
        ? { user: clone(db.user), csrfToken: "mock-csrf-token" }
        : { user: null, csrfToken: null };
    },

    async logout() {
      await latency();
      owner();
      db.user = null;
      persist();
    },

    async createUpload(input) {
      await latency();
      owner();
      const limit = input.kind === "package" ? LIMITS.zipBytes : LIMITS.imageBytes;
      if (input.size > limit) fail(413, "UPLOAD_TOO_LARGE", "文件超过大小上限");
      const upload: Upload = {
        id: nextId("upl"),
        kind: input.kind,
        status: "awaiting_upload",
        fileName: input.fileName,
        size: input.size,
        sha256: null,
        manifest: null,
        error: null,
        createdAt: now().toISOString(),
      };
      db.uploads.push(upload);
      persist();
      return {
        upload: clone(upload),
        uploadUrl: `/v1/uploads/${upload.id}/content`,
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
      };
    },

    sendUpload,

    async getUpload(id) {
      await latency();
      owner();
      return clone(findUpload(id));
    },

    async getUploadContent(id) {
      await latency();
      owner();
      const upload = findUpload(id);
      if (upload.status !== "ready" || upload.kind === "package")
        fail(404, "NOT_FOUND", "图片不可用");
      const blob = images.get(id);
      if (blob) return blob;
      if (id.startsWith("upl_sample")) {
        return new Blob([sampleImageSvg(upload.fileName, upload.kind === "screenshot")], {
          type: "image/svg+xml",
        });
      }
      return fail(404, "NOT_FOUND", "模拟模式刷新后不保留已上传的图片内容");
    },

    async createSubmission(clientRequestId) {
      await latency();
      owner();
      const existing = db.requests[clientRequestId];
      if (existing) return clone(findSubmission(existing));
      const time = now().toISOString();
      const submission: Submission = {
        id: nextId("sub"),
        revision: 1,
        status: "draft",
        packageUploadId: null,
        manifest: null,
        listing: emptyListing(),
        repositoryId: null,
        createdAt: time,
        updatedAt: time,
        submittedAt: null,
      };
      db.submissions.push(submission);
      db.requests[clientRequestId] = submission.id;
      persist();
      return clone(submission);
    },

    async listSubmissions(cursor) {
      await latency();
      owner();
      const flags = getFlags();
      if (flags.list === "error") fail(503, "SERVICE_UNAVAILABLE", "发布服务暂时不可用");
      if (flags.list === "empty") return { items: [], nextCursor: null };
      const sorted = [...db.submissions].sort((a, b) => b.id.localeCompare(a.id));
      const start = cursor ? Number(cursor) : 0;
      const items = sorted.slice(start, start + PAGE_SIZE);
      const next = start + PAGE_SIZE < sorted.length ? String(start + PAGE_SIZE) : null;
      return { items: clone(items), nextCursor: next };
    },

    async getSubmission(id) {
      await latency();
      owner();
      return clone(findSubmission(id));
    },

    async saveSubmission(id, body) {
      await latency();
      owner();
      const current = findSubmission(id);
      if (getFlags().conflictNextSave && current.status === "draft") {
        setFlags({ conflictNextSave: false });
        current.revision += 1;
        current.listing = { ...current.listing, summary: "（另一窗口保存的简介）" };
        current.updatedAt = now().toISOString();
        persist();
      }
      if (current.status !== "draft")
        fail(409, "SUBMISSION_LOCKED", "该记录已提交审核，请查看只读详情");
      if (body.revision !== current.revision)
        fail(409, "REVISION_CONFLICT", "草稿已更新，请读取最新版本后比较修改");
      validateListing(body.listing, false);
      if (body.packageUploadId) readyRef(body.packageUploadId, "package");
      if (body.listing.iconUploadId) readyRef(body.listing.iconUploadId, "icon");
      body.listing.screenshotUploadIds.forEach(ref => readyRef(ref, "screenshot"));
      current.packageUploadId = body.packageUploadId;
      current.manifest = body.packageUploadId ? findUpload(body.packageUploadId).manifest : null;
      current.listing = clone(body.listing);
      current.revision += 1;
      current.updatedAt = now().toISOString();
      persist();
      return clone(current);
    },

    async submitSubmission(id, revision) {
      await latency();
      owner();
      const current = findSubmission(id);
      if (current.status === "pending_review") return clone(current);
      if (revision !== current.revision)
        fail(409, "REVISION_CONFLICT", "草稿已更新，请读取最新版本后重新确认提交");
      validateListing(current.listing, true);
      if (!current.packageUploadId || !current.manifest)
        fail(400, "INVALID_INPUT", "请先上传插件包并保存");
      const flags = getFlags();
      if (flags.submit === "repository") {
        fail(422, "REPOSITORY_NOT_ALLOWED", "找不到公开仓库或指定提交，或你没有该仓库的管理权限");
      }
      if (flags.submit === "github")
        fail(503, "GITHUB_UNAVAILABLE", "GitHub 暂时不可用，请稍后重试");
      const { id: pluginId, version } = current.manifest!;
      const duplicate = db.submissions.some(
        item =>
          item.status === "pending_review" &&
          item.manifest?.id === pluginId &&
          item.manifest.version === version
      );
      if (duplicate)
        fail(
          409,
          "VERSION_ALREADY_SUBMITTED",
          "该插件版本已有待审核提交，请在我的提交中查看已有记录"
        );
      const time = now().toISOString();
      current.status = "pending_review";
      current.revision += 1;
      current.repositoryId = "repo_mock";
      current.submittedAt = time;
      current.updatedAt = time;
      persist();
      if (flags.submit === "network") throw networkError();
      return clone(current);
    },
  };

  const controller: MockController = {
    getFlags,
    setFlags,
    reset() {
      db = createSampleDb(now());
      images.clear();
      persist();
    },
    signIn() {
      db.user = MOCK_USER;
      persist();
    },
    isSignedIn: () => !!db.user,
  };

  return { api, controller };
}
