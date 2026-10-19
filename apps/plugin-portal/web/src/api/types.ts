import type {
  CreateUpload,
  SaveSubmission,
  Session,
  Submission,
  SubmissionPage,
  Upload,
  UploadTicket,
  FeedbackMessage,
  ReviewDetails,
  ReviewRequest,
  SubmissionQuery,
  SubmissionGroups,
  ReleasePage,
  PublicRelease,
  DownloadStatistics,
} from "../../../contracts";

export interface UploadProgress {
  loaded: number;
  total: number;
}

/** 一次上传传输：result 只在服务端响应后落定，abort 不保证撤销服务端已接收的内容 */
export interface UploadTransfer {
  result: Promise<Upload>;
  abort(): void;
}

/** 前端唯一的后端入口；真实 HTTP 与显式模拟模式各实现一份 */
export interface PortalApi {
  listModerationComments(
    filter: import("../../../contracts").ModerationFilter,
    cursor: string | null
  ): Promise<
    import("../../../contracts").ModerationPage<import("../../../contracts").ModerationComment>
  >;
  listModerationEvents(
    cursor: string | null
  ): Promise<
    import("../../../contracts").ModerationPage<import("../../../contracts").ModerationEvent>
  >;
  moderate(
    input: import("../../../contracts").ModerationInput
  ): Promise<import("../../../contracts").ModerationEvent>;
  getCommunity(
    pluginId: string,
    cursor: string | null
  ): Promise<import("../../../contracts").PluginCommunity>;
  setPluginLiked(pluginId: string, liked: boolean): Promise<{ liked: boolean }>;
  addComment(
    pluginId: string,
    message: string,
    clientRequestId: string
  ): Promise<import("../../../contracts").PluginComment>;
  deleteComment(pluginId: string, commentId: string): Promise<{ deleted: boolean }>;
  getCatalog(input: {
    q: string;
    category: import("../../../contracts").PluginCategory | null;
    sort: import("../../../contracts").CatalogSort;
    cursor: string | null;
  }): Promise<import("../../../contracts").Catalog>;
  downloadRelease(id: string): Promise<Blob>;
  /** 某插件的已发布版本，按发布时间倒序分页 */
  listReleases(pluginId: string, cursor: string | null): Promise<ReleasePage>;
  getRelease(id: string): Promise<PublicRelease>;
  getPluginStats(pluginId: string): Promise<DownloadStatistics>;
  /** 顶层导航地址（不是 fetch 目标） */
  readonly githubLoginUrl: string;
  getSession(): Promise<Session>;
  logout(): Promise<void>;
  createUpload(input: CreateUpload): Promise<UploadTicket>;
  sendUpload(
    ticket: UploadTicket,
    file: Blob,
    onProgress: (progress: UploadProgress) => void
  ): UploadTransfer;
  getUpload(id: string): Promise<Upload>;
  createSubmission(clientRequestId: string): Promise<Submission>;
  listSubmissions(query: SubmissionQuery): Promise<SubmissionPage>;
  /** 本人全部提交按插件归组 */
  listSubmissionGroups(): Promise<SubmissionGroups>;
  getSubmission(id: string): Promise<Submission>;
  saveSubmission(id: string, body: SaveSubmission): Promise<Submission>;
  submitSubmission(id: string, revision: number): Promise<Submission>;
  listFeedback(
    id: string,
    cursor: string | null
  ): Promise<{ items: FeedbackMessage[]; nextCursor: string | null }>;
  sendFeedback(id: string, message: string, clientRequestId: string): Promise<FeedbackMessage>;
  getReviews(id: string): Promise<ReviewDetails>;
  reviewSubmission(id: string, input: ReviewRequest): Promise<ReviewDetails>;
  retryPublish(id: string): Promise<ReviewDetails>;
  packageDownloadUrl(id: string): string | null;
}
