import type { PortalApi } from "../types";
import type { FeedbackMessage, Submission, Upload } from "../../../../contracts";
import { PortalApiError } from "../errors";
import { content, sampleSubmission } from "./samples";

export function createMockApi(): PortalApi {
  const records = new Map<string, Submission>(),
    uploads = new Map<string, Upload>(),
    messages = new Map<string, FeedbackMessage[]>();
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
    githubLoginUrl: "/submissions",
    getSession: async () => ({ user, csrfToken: user ? "mock" : null, reviewer: false }),
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
    listSubmissions: async () => ({
      items: [...records.values()].map(x => structuredClone(x)),
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
