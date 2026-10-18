import type { PortalApi } from "../types";
import type {
  FeedbackMessage,
  Submission,
  Upload,
  ReviewDetails,
  ReviewRecord,
  PluginComment,
} from "../../../../contracts";
import { PortalApiError } from "../errors";
import { content, sampleSubmission } from "./samples";

export function createMockApi(options: { reviewer?: boolean } = {}): PortalApi {
  const records = new Map<string, Submission>(),
    uploads = new Map<string, Upload>(),
    messages = new Map<string, FeedbackMessage[]>();
  const reviews = new Map<string, ReviewDetails>();
  const likes = new Set<string>();
  const comments = new Map<string, PluginComment[]>();
  const commentRequests = new Map<string, PluginComment>();
  let user = { id: "demo-author", login: "demo", avatarUrl: "" } as {
    id: string;
    login: string;
    avatarUrl: string;
  } | null;
  const fail = (
    code: "REVISION_CONFLICT" | "SUBMISSION_LOCKED" | "INVALID_INPUT",
    message: string
  ): never => {
    throw new PortalApiError(409, code, message);
  };
  const get = (id: string) => {
    const row = records.get(id);
    if (!row) throw new PortalApiError(404, "NOT_FOUND", "找不到模拟记录");
    return row;
  };
  return {
    getCommunity: async pluginId => ({
      likes: likes.has(pluginId) ? 1 : 0,
      liked: likes.has(pluginId),
      comments: comments.get(pluginId) ?? [],
      nextCursor: null,
    }),
    setPluginLiked: async (pluginId, liked) => {
      if (liked) likes.add(pluginId);
      else likes.delete(pluginId);
      return { liked };
    },
    addComment: async (pluginId, message, clientRequestId) => {
      const previous = commentRequests.get(clientRequestId);
      if (previous) return previous;
      const row: PluginComment = {
        id: crypto.randomUUID(),
        message,
        createdAt: new Date().toISOString(),
        canDelete: true,
        deleted: false,
      };
      comments.set(pluginId, [row, ...(comments.get(pluginId) ?? [])]);
      commentRequests.set(clientRequestId, row);
      return row;
    },
    deleteComment: async (pluginId, commentId) => {
      comments.set(
        pluginId,
        (comments.get(pluginId) ?? []).filter(row => row.id !== commentId)
      );
      return { deleted: true };
    },
    githubLoginUrl: "/submissions",
    getCatalog: async () => ({
      items: [],
      nextCursor: null,
      windowStart: new Date().toISOString().slice(0, 10),
    }),
    downloadRelease: async () => {
      throw new Error("模拟模式不提供发布包下载");
    },
    getSession: async () => ({
      user,
      csrfToken: user ? "mock" : null,
      reviewer: !!options.reviewer,
    }),
    logout: async () => {
      user = null;
    },
    createUpload: async input => {
      const upload: Upload = {
        id: crypto.randomUUID(),
        status: "awaiting_upload",
        fileName: input.fileName,
        size: input.size,
        sha256: null,
        content: null,
        error: null,
        createdAt: new Date().toISOString(),
      };
      uploads.set(upload.id, upload);
      return {
        upload,
        uploadUrl: "/mock",
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
      };
    },
    sendUpload: (ticket, file, onProgress) => {
      const result = Promise.resolve().then(() => {
        onProgress({ loaded: file.size, total: file.size });
        const upload = {
          ...ticket.upload,
          status: "ready" as const,
          content,
          sha256: "a".repeat(64),
        };
        uploads.set(upload.id, upload);
        return upload;
      });
      return { result, abort: () => {} };
    },
    getUpload: async id => {
      const upload = uploads.get(id);
      if (!upload) throw new PortalApiError(404, "NOT_FOUND", "找不到上传");
      return upload;
    },
    createSubmission: async id => {
      if (!records.has(id)) records.set(id, { ...sampleSubmission(), id });
      return structuredClone(get(id));
    },
    listSubmissions: async (_cursor, review = false) => ({
      items: [...records.values()]
        .filter(x => !review || !!x.submittedAt)
        .map(x => structuredClone(x)),
      nextCursor: null,
    }),
    getSubmission: async id => structuredClone(get(id)),
    saveSubmission: async (id, input) => {
      const row = get(id);
      if (!row.canEdit) fail("SUBMISSION_LOCKED", "内容已冻结");
      if (input.revision !== row.revision) fail("REVISION_CONFLICT", "草稿已变化");
      const upload = input.packageUploadId ? uploads.get(input.packageUploadId) : null;
      if (input.packageUploadId && !upload?.content) fail("INVALID_INPUT", "请先上传ZIP");
      const next = {
        ...row,
        repository: input.repository,
        packageUploadId: input.packageUploadId,
        content: upload?.content ?? null,
        revision: row.revision + 1,
      };
      records.set(id, next);
      return structuredClone(next);
    },
    submitSubmission: async (id, revision) => {
      const row = get(id);
      if (row.status === "pending_review") return structuredClone(row);
      if (!row.canEdit) fail("SUBMISSION_LOCKED", "该提交已结束");
      if (row.revision !== revision) fail("REVISION_CONFLICT", "草稿已变化");
      if (!row.content || !row.repository) fail("INVALID_INPUT", "请上传ZIP并关联仓库");
      const next = {
        ...row,
        status: "pending_review" as const,
        canEdit: false,
        revision: revision + 1,
        submittedAt: new Date().toISOString(),
        commit: "a".repeat(40),
      };
      records.set(id, next);
      return structuredClone(next);
    },
    getReviews: async id => structuredClone(reviews.get(id) ?? { reviews: [], release: null }),
    reviewSubmission: async (id, input) => {
      if (!options.reviewer) throw new PortalApiError(403, "FORBIDDEN", "仅审核者可审核");
      const row = get(id);
      if (row.status !== "pending_review" || row.revision !== input.revision)
        fail("REVISION_CONFLICT", "修订已变化");
      if (input.decision !== "approve" && !input.comment.trim())
        fail("INVALID_INPUT", "请填写审核原因");
      const record: ReviewRecord = {
        id: crypto.randomUUID(),
        revision: row.revision,
        packageUploadId: row.packageUploadId!,
        sha256: "a".repeat(64),
        manifest: row.content!.manifest,
        repository: row.repository,
        commit: row.commit!,
        reviewer: { id: "demo-author", login: "demo", avatarUrl: "" },
        decision: input.decision,
        comment: input.comment,
        createdAt: new Date().toISOString(),
      };
      const status = (
        { approve: "approved", request_changes: "changes_requested", reject: "rejected" } as const
      )[input.decision];
      records.set(id, {
        ...row,
        status,
        canEdit: status === "changes_requested",
        revision: row.revision + 1,
      });
      const result: ReviewDetails = {
        reviews: [record, ...(reviews.get(id)?.reviews ?? [])],
        release:
          input.decision === "approve"
            ? {
                id: record.id,
                pluginId: record.manifest.id,
                version: record.manifest.version,
                state: "published",
                sha256: record.sha256,
                size: 1,
                error: null,
                publishedAt: record.createdAt,
                downloadUrl: null,
              }
            : null,
      };
      reviews.set(id, result);
      return structuredClone(result);
    },
    retryPublish: async id => structuredClone(reviews.get(id) ?? { reviews: [], release: null }),
    packageDownloadUrl: () => null,
    listFeedback: async id => ({ items: messages.get(id) ?? [], nextCursor: null }),
    sendFeedback: async (id, message, requestId) => {
      const list = messages.get(id) ?? [];
      const old = list.find(x => x.id === requestId);
      if (old) return old;
      const row: FeedbackMessage = {
        id: requestId,
        author: { id: "demo-author", login: "demo" },
        role: "author",
        message,
        createdAt: new Date().toISOString(),
      };
      messages.set(id, [...list, row]);
      return row;
    },
  };
}
