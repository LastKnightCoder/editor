import { describe, expect, it, vi } from "vitest";
import type { UploadTicket } from "../../../contracts";
import { PortalApiError } from "./errors";
import { guardSession } from "./guardSession";
import { createHttpApi, type XhrLike } from "./http";

const BASE = "http://localhost:8787";
const SESSION = { user: { id: "1", login: "a", avatarUrl: "" }, csrfToken: "csrf-1" };

type Route = (init: RequestInit) => { status: number; body: unknown };

function stubFetch(routes: Record<string, Route>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const key = `${init.method ?? "GET"} ${url.replace(BASE, "")}`;
    const route = routes[key];
    if (!route) throw new TypeError("Failed to fetch");
    const { status, body } = route(init);
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const header = (init: RequestInit, name: string) =>
  (init.headers as Record<string, string> | undefined)?.[name];

describe("HTTP 客户端", () => {
  it("所有请求都带 credentials: include", async () => {
    const { fetch, calls } = stubFetch({
      "GET /v1/session": () => ({ status: 200, body: { data: SESSION } }),
      "GET /v1/submissions": () => ({
        status: 200,
        body: { data: { items: [], nextCursor: null } },
      }),
      "POST /v1/submissions": () => ({ status: 201, body: { data: { id: "s1" } } }),
    });
    const api = createHttpApi({ baseUrl: BASE + "/", fetch });
    await api.listSubmissions(null);
    await api.createSubmission("00000000-0000-4000-8000-000000000000");
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls.every(call => call.init.credentials === "include")).toBe(true);
  });

  it("写操作从 session 取 CSRF 令牌，读操作不带", async () => {
    const { fetch, calls } = stubFetch({
      "GET /v1/session": () => ({ status: 200, body: { data: SESSION } }),
      "GET /v1/submissions/s1": () => ({ status: 200, body: { data: { id: "s1" } } }),
      "PATCH /v1/submissions/s1": () => ({ status: 200, body: { data: { id: "s1" } } }),
    });
    const api = createHttpApi({ baseUrl: BASE, fetch });
    await api.getSubmission("s1");
    await api.saveSubmission("s1", { revision: 1, packageUploadId: null, repository: "" });
    const read = calls.find(call => call.url.endsWith("/v1/submissions/s1") && !call.init.method);
    const write = calls.find(call => call.init.method === "PATCH");
    expect(header(read!.init, "X-CSRF-Token")).toBeUndefined();
    expect(header(write!.init, "X-CSRF-Token")).toBe("csrf-1");
    expect(JSON.parse(String(write!.init.body))).toMatchObject({ revision: 1 });
  });

  it("未登录时写操作直接按 401 失败，不发出写请求", async () => {
    const { fetch, calls } = stubFetch({
      "GET /v1/session": () => ({ status: 200, body: { data: { user: null, csrfToken: null } } }),
    });
    const api = createHttpApi({ baseUrl: BASE, fetch });
    await expect(api.logout()).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(calls.map(call => call.init.method ?? "GET")).toEqual(["GET"]);
  });

  it("错误体解析为协议错误码与 message，字段错误保留", async () => {
    const { fetch } = stubFetch({
      "GET /v1/submissions/x": () => ({
        status: 404,
        body: { error: { code: "NOT_FOUND", message: "找不到提交记录", requestId: "r1" } },
      }),
    });
    const api = createHttpApi({ baseUrl: BASE, fetch });
    const error = await api.getSubmission("x").catch(e => e);
    expect(error).toBeInstanceOf(PortalApiError);
    expect(error).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "找不到提交记录",
      requestId: "r1",
    });
  });

  it("网络失败归为 NETWORK_ERROR（结果未知），不回退模拟数据", async () => {
    const { fetch } = stubFetch({});
    const api = createHttpApi({ baseUrl: BASE, fetch });
    await expect(api.listSubmissions(null)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("登录地址是后端 /v1/auth/github（顶层导航，不 fetch）", () => {
    const { fetch } = stubFetch({});
    expect(createHttpApi({ baseUrl: BASE, fetch }).githubLoginUrl).toBe(`${BASE}/v1/auth/github`);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("guardSession：任一请求 401 时通知会话过期", async () => {
    const { fetch } = stubFetch({
      "GET /v1/submissions": () => ({
        status: 401,
        body: { error: { code: "UNAUTHENTICATED", message: "请登录", requestId: "r" } },
      }),
      "GET /v1/session": () => ({ status: 200, body: { data: { user: null, csrfToken: null } } }),
    });
    const onExpired = vi.fn();
    const api = guardSession(createHttpApi({ baseUrl: BASE, fetch }), onExpired);
    await api.getSession();
    expect(onExpired).not.toHaveBeenCalled();
    await expect(api.listSubmissions(null)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(onExpired).toHaveBeenCalledTimes(1);
  });
});

class FakeXhr implements XhrLike {
  static last: FakeXhr;
  withCredentials = false;
  status = 0;
  responseText = "";
  upload: XhrLike["upload"] = { onprogress: null, onload: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: Blob | null = null;
  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: Blob) {
    this.body = body;
  }
  abort() {
    this.onabort?.();
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}

const ticket = (uploadUrl: string): UploadTicket => ({
  upload: {
    id: "u1",
    status: "awaiting_upload",
    fileName: "a.zip",
    size: 10,
    sha256: null,
    content: null,
    error: null,
    createdAt: "",
  },
  uploadUrl,
  method: "PUT",
  headers: { "Content-Type": "application/octet-stream" },
});

describe("XHR 上传", () => {
  const sessionFetch = () =>
    stubFetch({ "GET /v1/session": () => ({ status: 200, body: { data: SESSION } }) }).fetch;
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  it("按服务返回的 uploadUrl PUT，withCredentials，带票据头与 CSRF，并报告进度", async () => {
    const api = createHttpApi({
      baseUrl: BASE,
      fetch: sessionFetch(),
      createXhr: () => new FakeXhr(),
    });
    const progress: number[] = [];
    const file = new Blob(["0123456789"]);
    const transfer = api.sendUpload(ticket(`${BASE}/v1/uploads/u1/content`), file, p =>
      progress.push(p.loaded)
    );
    await flush();
    const xhr = FakeXhr.last;
    expect(xhr.method).toBe("PUT");
    expect(xhr.url).toBe(`${BASE}/v1/uploads/u1/content`);
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.headers).toMatchObject({
      "Content-Type": "application/octet-stream",
      "X-CSRF-Token": "csrf-1",
    });
    expect(xhr.body).toBe(file);
    xhr.upload.onprogress?.({ loaded: 4, total: 10, lengthComputable: true });
    xhr.upload.onload?.();
    expect(progress).toEqual([4, 10]);
    xhr.respond(200, { data: { ...ticket("").upload, status: "ready" } });
    await expect(transfer.result).resolves.toMatchObject({ id: "u1", status: "ready" });
  });

  it("相对 uploadUrl 以 API 地址为基准", async () => {
    const api = createHttpApi({
      baseUrl: BASE,
      fetch: sessionFetch(),
      createXhr: () => new FakeXhr(),
    });
    api.sendUpload(ticket("/v1/uploads/u1/content"), new Blob(["x"]), () => {});
    await flush();
    expect(FakeXhr.last.url).toBe(`${BASE}/v1/uploads/u1/content`);
  });

  it("abort 以 ABORTED 结束", async () => {
    const api = createHttpApi({
      baseUrl: BASE,
      fetch: sessionFetch(),
      createXhr: () => new FakeXhr(),
    });
    const transfer = api.sendUpload(
      ticket(`${BASE}/v1/uploads/u1/content`),
      new Blob(["x"]),
      () => {}
    );
    await flush();
    transfer.abort();
    await expect(transfer.result).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("422 校验失败保留服务端 message", async () => {
    const api = createHttpApi({
      baseUrl: BASE,
      fetch: sessionFetch(),
      createXhr: () => new FakeXhr(),
    });
    const transfer = api.sendUpload(
      ticket(`${BASE}/v1/uploads/u1/content`),
      new Blob(["x"]),
      () => {}
    );
    await flush();
    FakeXhr.last.respond(422, {
      error: { code: "INVALID_PACKAGE", message: "缺少 manifest", requestId: "r" },
    });
    await expect(transfer.result).rejects.toMatchObject({
      status: 422,
      code: "INVALID_PACKAGE",
      message: "缺少 manifest",
    });
  });

  it("拒绝把 Cookie 与 CSRF 发往 API 以外的上传地址", async () => {
    const created = vi.fn(() => new FakeXhr());
    const api = createHttpApi({ baseUrl: BASE, fetch: sessionFetch(), createXhr: created });
    const transfer = api.sendUpload(
      ticket("https://evil.example/upload"),
      new Blob(["x"]),
      () => {}
    );
    await expect(transfer.result).rejects.toMatchObject({ code: "BAD_RESPONSE" });
    expect(created).not.toHaveBeenCalled();
  });
});
