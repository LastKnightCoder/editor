import type { FetchRequestData, FetchResponseData } from "../../../src/services/fetch-bridge";

interface Transfer {
  owner: number;
  controller: AbortController;
  response: Promise<Response>;
  reader?: ReadableStreamDefaultReader<Uint8Array>;
  upload?: ReadableStreamDefaultController<Uint8Array>;
  uploadClosed: boolean;
  keepalive: boolean;
  detached?: boolean;
  wake?: () => void;
}

/** 原生 fetch 执行与按需传输；窗口销毁时释放所属请求。 */
export class FetchServer {
  private nextId = 0;
  private transfers = new Map<number, Transfer>();
  constructor(private readonly execute: typeof fetch = globalThis.fetch) {}

  open(owner: number, data: FetchRequestData): number {
    const id = ++this.nextId;
    const controller = new AbortController();
    let upload: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body =
      data.hasBody && data.bufferedBody === undefined
        ? new ReadableStream<Uint8Array>({
            start(value) {
              upload = value;
            },
            pull() {
              transfer.wake?.();
              transfer.wake = undefined;
            },
            cancel() {
              transfer.uploadClosed = true;
              transfer.wake?.();
            },
          })
        : undefined;
    const response = Promise.resolve().then(() =>
      this.execute(data.url, {
        method: data.method,
        headers: data.headers,
        redirect: data.redirect,
        credentials: data.credentials,
        cache: data.cache,
        mode: data.mode,
        referrer: data.referrer,
        referrerPolicy: data.referrerPolicy,
        integrity: data.integrity,
        keepalive: data.keepalive,
        body: data.bufferedBody ?? body,
        signal: controller.signal,
        duplex: "half",
      } as RequestInit)
    );
    // headers RPC 尚未到达时，网络失败也必须有拒绝处理器。
    void response.catch(() => undefined);
    const transfer: Transfer = {
      owner,
      controller,
      response,
      upload,
      uploadClosed: !upload,
      keepalive: data.keepalive,
    };
    this.transfers.set(id, transfer);
    return id;
  }

  private get(owner: number, id: number): Transfer {
    const transfer = this.transfers.get(id);
    if (!transfer || transfer.owner !== owner || transfer.detached)
      throw new TypeError("Fetch request is no longer available");
    return transfer;
  }

  async upload(owner: number, id: number, chunk: Uint8Array | null): Promise<boolean> {
    const transfer = this.transfers.get(id);
    if (!transfer) return false;
    if (transfer.owner !== owner) throw new TypeError("Fetch request is not owned by this window");
    if (transfer.uploadClosed || transfer.controller.signal.aborted) return false;
    if (chunk === null) {
      transfer.upload?.close();
      transfer.uploadClosed = true;
      return false;
    }
    transfer.upload?.enqueue(new Uint8Array(chunk));
    if ((transfer.upload?.desiredSize ?? 1) <= 0)
      await new Promise<void>(resolve => {
        transfer.wake = resolve;
      });
    return !transfer.uploadClosed && !transfer.controller.signal.aborted;
  }

  async response(owner: number, id: number): Promise<FetchResponseData> {
    const transfer = this.get(owner, id);
    try {
      const response = await transfer.response;
      transfer.reader = response.body?.getReader();
      const headers: [string, string][] = [...response.headers].filter(
        ([key]) => key !== "set-cookie"
      );
      for (const cookie of response.headers.getSetCookie()) headers.push(["set-cookie", cookie]);
      const result = {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        redirected: response.redirected,
        type: response.type,
        headers,
        hasBody: !!transfer.reader,
      };
      if (!transfer.reader) this.cancel(owner, id);
      return result;
    } catch (error) {
      this.cancel(owner, id);
      throw error;
    }
  }

  async read(owner: number, id: number): Promise<Uint8Array | null> {
    const transfer = this.get(owner, id);
    try {
      const result = await transfer.reader?.read();
      if (!result || result.done) {
        this.cancel(owner, id);
        return null;
      }
      return result.value;
    } catch (error) {
      this.cancel(owner, id);
      throw error;
    }
  }

  cancel(owner: number, id: number): void {
    const transfer = this.transfers.get(id);
    if (!transfer || transfer.owner !== owner) return;
    this.transfers.delete(id);
    transfer.controller.abort();
    transfer.wake?.();
    if (!transfer.uploadClosed) {
      transfer.uploadClosed = true;
      transfer.upload?.error(transfer.controller.signal.reason);
    }
    void transfer.reader?.cancel().catch(() => undefined);
  }
  closeOwner(owner: number): void {
    for (const [id, transfer] of this.transfers) {
      if (transfer.owner !== owner || transfer.detached) continue;
      if (!transfer.keepalive) {
        this.cancel(owner, id);
        continue;
      }
      transfer.detached = true;
      void transfer.response
        .then(async response => {
          const reader = transfer.reader ?? response.body?.getReader();
          if (reader)
            while (!(await reader.read()).done) {
              /* 完成 keepalive 后释放传输。 */
            }
        })
        .catch(() => undefined)
        .finally(() => this.cancel(owner, id));
    }
  }
  get size() {
    return this.transfers.size;
  }
}
