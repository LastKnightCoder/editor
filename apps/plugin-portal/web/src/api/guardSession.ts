import { PortalApiError } from "./errors";
import type { PortalApi } from "./types";

/**
 * 包装任意传输实现：请求收到 401 时通知会话已过期。
 * 未登录的 GET /v1/session 返回 200，不会触发。
 */
export function guardSession(api: PortalApi, onExpired: () => void): PortalApi {
  const watch = <T>(promise: Promise<T>): Promise<T> =>
    promise.catch((error: unknown) => {
      if (error instanceof PortalApiError && error.status === 401) onExpired();
      throw error;
    });
  return {
    getCommunity: (id, cursor) => api.getCommunity(id, cursor),
    setPluginLiked: (id, liked) => api.setPluginLiked(id, liked),
    addComment: (id, message, requestId) => api.addComment(id, message, requestId),
    deleteComment: (id, commentId) => api.deleteComment(id, commentId),
    getCatalog: input => api.getCatalog(input),
    downloadRelease: id => api.downloadRelease(id),
    githubLoginUrl: api.githubLoginUrl,
    getSession: () => watch(api.getSession()),
    logout: () => watch(api.logout()),
    createUpload: input => watch(api.createUpload(input)),
    sendUpload(ticket, file, onProgress) {
      const transfer = api.sendUpload(ticket, file, onProgress);
      return { result: watch(transfer.result), abort: () => transfer.abort() };
    },
    getUpload: id => watch(api.getUpload(id)),
    createSubmission: requestId => watch(api.createSubmission(requestId)),
    listSubmissions: (cursor, review) => watch(api.listSubmissions(cursor, review)),
    getSubmission: id => watch(api.getSubmission(id)),
    saveSubmission: (id, body) => watch(api.saveSubmission(id, body)),
    submitSubmission: (id, revision) => watch(api.submitSubmission(id, revision)),
    listFeedback: (id, cursor) => watch(api.listFeedback(id, cursor)),
    sendFeedback: (id, message, requestId) => watch(api.sendFeedback(id, message, requestId)),
    getReviews: id => watch(api.getReviews(id)),
    reviewSubmission: (id, input) => watch(api.reviewSubmission(id, input)),
    retryPublish: id => watch(api.retryPublish(id)),
    packageDownloadUrl: api.packageDownloadUrl,
  };
}
