import type { PortalApi } from "../types";
import type {
  FeedbackMessage,
  Submission,
  SubmissionCounts,
  SubmissionEvent,
  SubmissionGroup,
  Upload,
  ReviewDetails,
  ReviewRecord,
  PluginComment,
  PublicRelease,
  PluginCategory,
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
  const published = new Map<string, PublicRelease>();
  const event = (
    kind: SubmissionEvent["kind"],
    decision: SubmissionEvent["decision"],
    role: SubmissionEvent["role"],
    message: string
  ): SubmissionEvent => ({
    kind,
    decision,
    role,
    login: "demo",
    excerpt: message.slice(0, 120),
    createdAt: new Date().toISOString(),
  });
  const touch = (id: string, lastEvent: SubmissionEvent) => {
    const row = records.get(id);
    if (row) records.set(id, { ...row, lastEvent });
  };
  const releasesOf = (pluginId: string) =>
    [...published.values()].filter(release => release.pluginId === pluginId).reverse();
  const get = (id: string) => {
    const row = records.get(id);
    if (!row) throw new PortalApiError(404, "NOT_FOUND", "找不到模拟记录");
    return row;
  };
  return {
    listModerationComments: async () => ({ items: [], nextCursor: null }),
    listModerationEvents: async () => ({ items: [], nextCursor: null }),
    moderate: async () => {
      throw new Error("模拟模式没有可处置的评论");
    },
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
    getCatalog: async ({ q, category, cursor }) => {
      const latest = new Map<string, PublicRelease>();
      for (const release of published.values()) latest.set(release.pluginId, release);
      const query = q.trim().toLowerCase();
      const matched = [...latest.values()].filter(release =>
        [
          release.pluginId,
          release.content.manifest.name,
          release.content.manifest.description,
          ...(release.content.manifest.keywords ?? []),
        ]
          .join("\n")
          .toLowerCase()
          .includes(query)
      );
      const categoryCounts: Partial<Record<PluginCategory, number>> = {};
      for (const release of matched)
        for (const id of release.content.manifest.categories ?? [])
          categoryCounts[id] = (categoryCounts[id] ?? 0) + 1;
      return {
        categoryCounts: cursor ? null : categoryCounts,
        items: matched
          .filter(release => !category || release.content.manifest.categories?.includes(category))
          .map(release => {
            const version = {
              releaseId: release.id,
              version: release.version,
              minAppVersion: release.content.manifest.minAppVersion,
              publishedAt: release.publishedAt!,
              size: release.size,
              sha256: release.sha256,
              downloadUrl: "",
            };
            return {
              pluginId: release.pluginId,
              name: release.content.manifest.name,
              description: release.content.manifest.description,
              publisher: release.publisher,
              repository: release.repository,
              categories: [...(release.content.manifest.categories ?? [])],
              keywords: [...(release.content.manifest.keywords ?? [])],
              downloadsTotal: 0,
              downloads7d: 0,
              likes: likes.has(release.pluginId) ? 1 : 0,
              latest: version,
              compatible: version,
            };
          }),
        nextCursor: null,
        windowStart: new Date().toISOString().slice(0, 10),
      };
    },
    downloadRelease: async () => {
      throw new Error("模拟模式不提供发布包下载");
    },
    listReleases: async pluginId => ({
      items: releasesOf(pluginId).map(({ content: { manifest }, ...release }) => ({
        ...release,
        manifest,
      })),
      nextCursor: null,
    }),
    getRelease: async id => {
      const release = published.get(id);
      if (!release) throw new PortalApiError(404, "NOT_FOUND", "该版本尚未发布");
      return structuredClone(release);
    },
    getPluginStats: async pluginId => {
      if (!releasesOf(pluginId).length) throw new PortalApiError(404, "NOT_FOUND", "插件未发布");
      return { downloadsTotal: 0, downloads7d: 0, windowStart: new Date().toISOString() };
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
    listSubmissions: async ({ scope, status }) => {
      const scoped = [...records.values()].filter(x => scope !== "review" || !!x.submittedAt);
      const counts: SubmissionCounts = {
        draft: 0,
        pending_review: 0,
        changes_requested: 0,
        rejected: 0,
        approved: 0,
      };
      for (const row of scoped) counts[row.status] += 1;
      return {
        items: scoped.filter(x => !status || x.status === status).map(x => structuredClone(x)),
        nextCursor: null,
        counts,
      };
    },
    listSubmissionGroups: async () => {
      const groups = new Map<string | null, SubmissionGroup>();
      for (const row of [...records.values()].reverse()) {
        const manifest = row.content?.manifest ?? null;
        const key = manifest?.id ?? null;
        const group = groups.get(key) ?? {
          pluginId: key,
          name: manifest?.name ?? null,
          submissions: [],
        };
        group.submissions.push({
          id: row.id,
          status: row.status,
          pluginId: key,
          name: manifest?.name ?? null,
          version: manifest?.version ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          submittedAt: row.submittedAt,
          lastEvent: row.lastEvent,
        });
        groups.set(key, group);
      }
      return { groups: [...groups.values()] };
    },
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
      const systemReviewed =
        input.decision === "approve" &&
        !!row.content &&
        "backend" in row.content.manifest &&
        !!row.content.manifest.backend;
      if (systemReviewed && !input.systemReviewConfirmed)
        fail("INVALID_INPUT", "请确认系统能力审核");
      const record: ReviewRecord = {
        systemReviewed,
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
        lastEvent: event("review", input.decision, "reviewer", input.comment),
      });
      if (input.decision === "approve")
        published.set(record.id, {
          systemReviewed,
          id: record.id,
          pluginId: record.manifest.id,
          version: record.manifest.version,
          state: "published",
          sha256: record.sha256,
          size: 1,
          error: null,
          publishedAt: record.createdAt,
          downloadUrl: null,
          content: row.content!,
          repository: row.repository,
          commit: row.commit!,
          publisher: { login: "demo", avatarUrl: "" },
        });
      const result: ReviewDetails = {
        reviews: [record, ...(reviews.get(id)?.reviews ?? [])],
        release:
          input.decision === "approve"
            ? {
                systemReviewed,
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
    revokeRelease: async (id, input) => {
      if (!options.reviewer) throw new PortalApiError(403, "FORBIDDEN", "仅审核者可撤回版本");
      if (!input.reason.trim()) fail("INVALID_INPUT", "请填写撤回原因");
      const result = reviews.get(id);
      if (!result?.release) throw new PortalApiError(409, "SUBMISSION_LOCKED", "尚无可撤回版本");
      result.release.revokedAt = new Date().toISOString();
      result.release.downloadUrl = null;
      published.delete(result.release.id);
      return structuredClone(result);
    },
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
      touch(id, event("feedback", null, "author", message));
      return row;
    },
  };
}
