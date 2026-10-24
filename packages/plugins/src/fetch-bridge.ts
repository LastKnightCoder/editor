/** IPC 仅传可克隆元数据与字节，公共接口仍为原生 fetch。 */
export interface FetchRequestData {
  url: string;
  method: string;
  headers: [string, string][];
  redirect: RequestRedirect;
  credentials: RequestCredentials;
  cache: RequestCache;
  mode: RequestMode;
  referrer: string;
  referrerPolicy: ReferrerPolicy;
  integrity: string;
  keepalive: boolean;
  hasBody: boolean;
  bufferedBody?: Uint8Array;
}
export interface FetchResponseData {
  status: number;
  statusText: string;
  headers: [string, string][];
  url: string;
  redirected: boolean;
  type: ResponseType;
  hasBody: boolean;
}
export type FetchReply<T> =
  { ok: true; value: T } | { ok: false; error: { name: string; message: string } };
export interface FetchTransport {
  open(request: FetchRequestData): Promise<number>;
  upload(id: number, chunk: Uint8Array | null): Promise<boolean>;
  response(id: number): Promise<FetchResponseData>;
  read(id: number): Promise<Uint8Array | null>;
  cancel(id: number): Promise<void>;
  buffer?(id: number): Promise<Uint8Array>;
}

function decorate(response: Response, metadata: FetchResponseData): Response {
  const clone = response.clone.bind(response);
  const headers = new Headers(metadata.headers);
  const immutable = () => {
    throw new TypeError("Headers are immutable");
  };
  Object.defineProperties(headers, {
    append: { value: immutable },
    set: { value: immutable },
    delete: { value: immutable },
  });
  Object.defineProperties(response, {
    headers: { value: headers },
    url: { value: metadata.url },
    redirected: { value: metadata.redirected },
    type: { value: metadata.type },
    clone: { value: () => decorate(clone(), metadata) },
  });
  return response;
}

export const FETCH_CHUNK_BYTES = 256 * 1024;

export function createBridgeFetch(transport: FetchTransport): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, { ...init, duplex: "half" } as RequestInit);
    // 宿主执行不受浏览器禁用请求头约束，保留调用方显式提供的 Cookie/Referer 等。
    const headers = new Headers(request.headers);
    if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    const signal = request.signal;
    signal.throwIfAborted();
    const bufferedBody =
      request.keepalive && request.body ? new Uint8Array(await request.arrayBuffer()) : undefined;
    const reader = bufferedBody ? undefined : request.body?.getReader();
    let id: number | undefined;
    let finished = false;
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const release = () => {
      finished = true;
      signal.removeEventListener("abort", abort);
    };
    const cancel = () => {
      if (id !== undefined) void transport.cancel(id).catch(() => undefined);
      void reader?.cancel().catch(() => undefined);
    };
    let rejectAbort: (reason: unknown) => void = () => undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
    });
    // 打开传输前也可能取消，始终安装拒绝处理器。
    void aborted.catch(() => undefined);
    const abort = () => {
      if (finished) return;
      controller?.error(signal.reason);
      rejectAbort(signal.reason);
      cancel();
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      id = await transport.open({
        url: request.url,
        method: request.method,
        headers: [...headers],
        redirect: request.redirect,
        credentials: request.credentials,
        cache: request.cache,
        mode: request.mode,
        referrer: request.referrer,
        referrerPolicy: request.referrerPolicy,
        integrity: request.integrity,
        keepalive: request.keepalive,
        hasBody: request.body !== null,
        bufferedBody,
      });
      if (signal.aborted) {
        cancel();
        signal.throwIfAborted();
      }
      const requestId = id;
      const uploading = async () => {
        if (!reader) return;
        try {
          while (!finished) {
            const chunk = await reader.read();
            signal.throwIfAborted();
            if (chunk.done) {
              await transport.upload(requestId, null);
              break;
            }
            for (let offset = 0; offset < chunk.value.length; offset += FETCH_CHUNK_BYTES) {
              signal.throwIfAborted();
              if (
                !(await transport.upload(
                  requestId,
                  chunk.value.subarray(offset, offset + FETCH_CHUNK_BYTES)
                ))
              )
                return;
            }
          }
        } finally {
          void reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
      };
      const failedUpload = new Promise<never>((_resolve, reject) => {
        void uploading().catch(error => {
          if (!finished) {
            cancel();
            controller?.error(error);
            reject(error);
          }
        });
      });
      const metadata = await Promise.race([transport.response(requestId), failedUpload, aborted]);
      let bufferRequested = false;
      signal.throwIfAborted();
      const body = metadata.hasBody
        ? new ReadableStream<Uint8Array>(
            {
              start(value) {
                controller = value;
              },
              async pull(value) {
                try {
                  if (bufferRequested && transport.buffer) {
                    const bytes = await transport.buffer(requestId);
                    if (signal.aborted || finished) return;
                    value.enqueue(bytes);
                    value.close();
                    cancel();
                    release();
                    return;
                  }
                  const chunk = await transport.read(requestId);
                  if (signal.aborted || finished) return;
                  if (chunk === null) {
                    value.close();
                    release();
                  } else value.enqueue(chunk);
                } catch (error) {
                  if (!signal.aborted && !finished) value.error(error);
                  cancel();
                  release();
                }
              },
              cancel() {
                cancel();
                release();
              },
            },
            { highWaterMark: 0 }
          )
        : null;
      if (!body) {
        cancel();
        release();
      }
      const response = decorate(
        new Response(body, {
          status: metadata.status,
          statusText: metadata.statusText,
          headers: metadata.headers,
        }),
        metadata
      );
      if (body && transport.buffer) {
        const original = response.arrayBuffer.bind(response);
        Object.defineProperty(response, "arrayBuffer", {
          value: async () => {
            if (response.bodyUsed || response.body?.locked) throw new TypeError("Body is unusable");
            if (response.body !== body) return original();
            bufferRequested = true;
            const reader = body.getReader();
            try {
              const chunk = await reader.read();
              await reader.read();
              const bytes = chunk.value ?? new Uint8Array();
              return (
                bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
                  ? bytes.buffer
                  : bytes.slice().buffer
              ) as ArrayBuffer;
            } finally {
              reader.releaseLock();
            }
          },
        });
      }
      return response;
    } catch (error) {
      cancel();
      release();
      if (signal.aborted) throw signal.reason;
      throw error;
    }
  };
}
