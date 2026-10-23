import type {
  CreateSubmission,
  CreateUpload,
  ManagedPlugin,
  ManagedPluginFilter,
  ModerationPage,
  PluginModerationEvent,
  PluginModerationInput,
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
  AppFeedbackDetail,
  AppFeedbackFilter,
  AppFeedbackPage,
  AppFeedbackUpdate,
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
  readonly center: import("@tau/plugins/center").PluginCenterClient;
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
  /** 管理端插件列表：含被禁用插件，q 匹配 ID 与已发布名称 */
  listManagedPlugins(
    filter: ManagedPluginFilter,
    cursor: string | null
  ): Promise<ModerationPage<ManagedPlugin>>;
  moderatePlugin(input: PluginModerationInput): Promise<PluginModerationEvent>;
  listPluginModerationEvents(cursor: string | null): Promise<ModerationPage<PluginModerationEvent>>;
  listAppFeedback(filter: AppFeedbackFilter, cursor: string | null): Promise<AppFeedbackPage>;
  getAppFeedback(id: string): Promise<AppFeedbackDetail>;
  updateAppFeedback(id: string, input: AppFeedbackUpdate): Promise<AppFeedbackDetail>;
  /** 附件需管理员会话，取回 Blob 后由页面生成 object URL */
  getAppFeedbackAttachment(id: string, attachmentId: string): Promise<Blob>;
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
  /** 草稿只在包校验通过后创建；pluginId 为「发布新版本」目标 */
  createSubmission(input: CreateSubmission): Promise<Submission>;
  listSubmissions(query: SubmissionQuery): Promise<SubmissionPage>;
  /** 本人全部提交按插件归组 */
  listSubmissionGroups(): Promise<SubmissionGroups>;
  getSubmission(id: string): Promise<Submission>;
  saveSubmission(id: string, body: SaveSubmission): Promise<Submission>;
  submitSubmission(id: string, revision: number): Promise<Submission>;
  /** 审核中的提交退回草稿 */
  withdrawSubmission(id: string, revision: number): Promise<Submission>;
  /** 只能删除未进入审核的草稿 */
  deleteSubmission(id: string): Promise<{ deleted: boolean }>;
  listFeedback(
    id: string,
    cursor: string | null
  ): Promise<{ items: FeedbackMessage[]; nextCursor: string | null }>;
  sendFeedback(id: string, message: string, clientRequestId: string): Promise<FeedbackMessage>;
  getReviews(id: string): Promise<ReviewDetails>;
  reviewSubmission(id: string, input: ReviewRequest): Promise<ReviewDetails>;
  retryPublish(id: string): Promise<ReviewDetails>;
  revokeRelease(
    id: string,
    input: { reason: string; clientRequestId: string }
  ): Promise<ReviewDetails>;
  packageDownloadUrl(id: string): string | null;
}
