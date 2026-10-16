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
  listSubmissions(cursor: string | null, review?: boolean): Promise<SubmissionPage>;
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
