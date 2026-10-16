import type {
  ApiResult,
  CreateUpload,
  SaveSubmission,
  Session,
  Submission,
  SubmissionPage,
  Upload,
  UploadTicket,
} from "../../../contracts";
import { PortalApiError, abortedError, errorFromResponse, networkError } from "./errors";
import type { PortalApi, UploadProgress, UploadTransfer } from "./types";

/** XHR 的最小子集，便于测试注入 */
export interface XhrLike {
  withCredentials: boolean;
  status: number;
  responseText: string;
  upload: {
    onprogress:
      ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null;
    onload: (() => void) | null;
  };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  ontimeout: (() => void) | null;
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(body: Blob): void;
  abort(): void;
}

export interface HttpApiOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  createXhr?: () => XhrLike;
}

const CSRF_HEADER = "X-CSRF-Token";

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export function createHttpApi(options: HttpApiOptions): PortalApi {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const apiOrigin = new URL(baseUrl).origin;
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const createXhr = options.createXhr ?? (() => new XMLHttpRequest() as unknown as XhrLike);
  let csrfToken: string | null = null;

  /** 401 说明会话已失效，丢弃缓存的 CSRF 令牌 */
  const unauthenticated = (error: PortalApiError) => {
    if (error.status === 401) csrfToken = null;
    return error;
  };

  async function send(path: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      response = await doFetch(baseUrl + path, { ...init, credentials: "include" });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw abortedError();
      throw networkError();
    }
    if (!response.ok) {
      const body = parseJson(await response.text().catch(() => ""));
      throw unauthenticated(errorFromResponse(response.status, body));
    }
    return response;
  }

  async function readData<T>(response: Response): Promise<T> {
    const body = parseJson(await response.text().catch(() => "")) as ApiResult<T> | null;
    if (!body || !("data" in body)) {
      throw new PortalApiError(response.status, "BAD_RESPONSE", "服务返回了无法识别的响应");
    }
    return body.data;
  }

  async function getSession(): Promise<Session> {
    const session = await readData<Session>(await send("/v1/session"));
    csrfToken = session.user ? session.csrfToken : null;
    return session;
  }

  /** 写操作的 CSRF 令牌：缓存缺失时向 session 补取一次，仍没有即视为未登录 */
  async function requireCsrf(): Promise<string> {
    if (csrfToken) return csrfToken;
    const session = await getSession();
    if (!session.user || !session.csrfToken) {
      throw unauthenticated(new PortalApiError(401, "UNAUTHENTICATED", "登录已失效，请重新登录"));
    }
    return session.csrfToken;
  }

  async function write<T>(method: "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
    const token = await requireCsrf();
    const headers: Record<string, string> = { [CSRF_HEADER]: token };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await send(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return readData<T>(response);
  }

  const read = async <T>(path: string) => readData<T>(await send(path));
  const id = (value: string) => encodeURIComponent(value);

  function sendUpload(
    ticket: UploadTicket,
    file: Blob,
    onProgress: (progress: UploadProgress) => void
  ): UploadTransfer {
    let xhr: XhrLike | null = null;
    let aborted = false;
    const result = (async () => {
      const url = new URL(ticket.uploadUrl, baseUrl + "/");
      // 请求携带 Cookie 与 CSRF 令牌，只允许发往 API 自身
      if (url.origin !== apiOrigin) {
        throw new PortalApiError(0, "BAD_RESPONSE", "服务返回的上传地址不属于发布服务，已拒绝上传");
      }
      const token = await requireCsrf();
      if (aborted) throw abortedError();
      return new Promise<Upload>((resolve, reject) => {
        const request = createXhr();
        xhr = request;
        request.open(ticket.method, url.href);
        request.withCredentials = true;
        for (const [name, value] of Object.entries(ticket.headers)) {
          request.setRequestHeader(name, value);
        }
        request.setRequestHeader(CSRF_HEADER, token);
        request.upload.onprogress = event =>
          onProgress({
            loaded: event.loaded,
            total: event.lengthComputable ? event.total : file.size,
          });
        // 请求体发送完毕：此后等待服务端校验响应
        request.upload.onload = () => onProgress({ loaded: file.size, total: file.size });
        request.onload = () => {
          const body = parseJson(request.responseText);
          if (request.status >= 200 && request.status < 300) {
            const data = (body as ApiResult<Upload> | null)?.data;
            if (data) resolve(data);
            else
              reject(
                new PortalApiError(request.status, "BAD_RESPONSE", "服务返回了无法识别的响应")
              );
          } else {
            reject(unauthenticated(errorFromResponse(request.status, body)));
          }
        };
        request.onerror = () => reject(networkError());
        request.ontimeout = () => reject(networkError());
        request.onabort = () => reject(abortedError());
        request.send(file);
      });
    })();
    return {
      result,
      abort() {
        aborted = true;
        xhr?.abort();
      },
    };
  }

  return {
    githubLoginUrl: `${baseUrl}/v1/auth/github`,
    getSession,
    async logout() {
      await write<{ loggedOut: true }>("POST", "/v1/logout");
      csrfToken = null;
    },
    createUpload: (input: CreateUpload) => write<UploadTicket>("POST", "/v1/uploads", input),
    sendUpload,
    getUpload: uploadId => read<Upload>(`/v1/uploads/${id(uploadId)}`),
    createSubmission: clientRequestId =>
      write<Submission>("POST", "/v1/submissions", { clientRequestId }),
    listSubmissions: (cursor, review = false) => {
      const query = new URLSearchParams({
        ...(cursor ? { cursor } : {}),
        ...(review ? { scope: "review" } : {}),
      }).toString();
      return read<SubmissionPage>(`/v1/submissions${query ? `?${query}` : ""}`);
    },
    getSubmission: submissionId => read<Submission>(`/v1/submissions/${id(submissionId)}`),
    saveSubmission: (submissionId, body: SaveSubmission) =>
      write<Submission>("PATCH", `/v1/submissions/${id(submissionId)}`, body),
    submitSubmission: (submissionId, revision) =>
      write<Submission>("POST", `/v1/submissions/${id(submissionId)}/submit`, { revision }),
    listFeedback: (submissionId, cursor) =>
      read(
        `/v1/submissions/${id(submissionId)}/feedback${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
      ),
    sendFeedback: (submissionId, message, clientRequestId) =>
      write("POST", `/v1/submissions/${id(submissionId)}/feedback`, { message, clientRequestId }),
  };
}
