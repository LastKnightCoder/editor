import { EventEmitter } from "node:events";
import { ipcMain, WebContents } from "electron";

interface StreamResponse {
  requestId: number;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

interface ChunkPayload {
  requestId: number;
  chunk: Buffer;
}

interface EndPayload {
  requestId: number;
  status: number;
}

export default class StreamFetch extends EventEmitter {
  private static requestCounter = 0;
  private static instance: StreamFetch;
  private static requestLock = Promise.resolve();
  private static senders = new Map<number, WebContents>();
  private static activeRequests = new Map<number, AbortController>();

  private constructor() {
    super();
  }

  private static async getNextRequestId(): Promise<number> {
    return new Promise<number>((resolve) => {
      StreamFetch.requestLock = StreamFetch.requestLock.then(() => {
        const id = ++StreamFetch.requestCounter;
        resolve(id);
      });
    });
  }

  public static init() {
    const streamFetch = StreamFetch.getInstance();

    ipcMain.handle(
      "stream-fetch",
      async (
        event,
        {
          method,
          url,
          headers,
          body,
        }: {
          method: string;
          url: string;
          headers: Record<string, string>;
          body?: Buffer;
        },
      ) => {
        const requestId = await StreamFetch.getNextRequestId();
        StreamFetch.senders.set(requestId, event.sender);
        return await streamFetch.fetch(
          method,
          url,
          headers,
          body ?? null,
          requestId,
        );
      },
    );

    ipcMain.handle(
      "stream-fetch-cancel",
      async (_event, { requestId }: { requestId: number }) => {
        const abortController = StreamFetch.activeRequests.get(requestId);
        if (abortController) {
          abortController.abort("Request cancelled by user");
          StreamFetch.activeRequests.delete(requestId);

          const sender = StreamFetch.senders.get(requestId);
          if (sender) {
            StreamFetch.senders.delete(requestId);
          }
        }
      },
    );

    streamFetch.on("chunk", (payload: ChunkPayload) => {
      const { requestId } = payload;
      if (StreamFetch.senders.has(requestId)) {
        StreamFetch.senders.get(requestId)?.send("stream-response", payload);
      }
    });

    streamFetch.on("end", (payload: EndPayload) => {
      const { requestId } = payload;
      const sender = StreamFetch.senders.get(requestId);
      if (sender) {
        sender.send("stream-response", payload);
        StreamFetch.senders.delete(requestId);
      }
      StreamFetch.activeRequests.delete(requestId);
    });

    streamFetch.on(
      "error",
      ({ requestId, error }: { requestId: number; error: Error }) => {
        const sender = StreamFetch.senders.get(requestId);
        if (sender) {
          sender.send("stream-response", {
            requestId,
            chunk: Buffer.from(error.message),
          });
          sender.send("stream-response", { requestId, status: 0 });
          StreamFetch.senders.delete(requestId);
        }
        StreamFetch.activeRequests.delete(requestId);
      },
    );
  }

  public static getInstance(): StreamFetch {
    if (!StreamFetch.instance) {
      StreamFetch.instance = new StreamFetch();
    }
    return StreamFetch.instance;
  }

  public async fetch(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: Buffer | string | null,
    requestId: number,
  ): Promise<StreamResponse> {
    const abortController = new AbortController();
    StreamFetch.activeRequests.set(requestId, abortController);

    const config: RequestInit = {
      method,
      headers,
      body: JSON.stringify(body),
      signal: abortController.signal,
    };
    try {
      console.log("config", config);
      const response = await fetch(url, config);

      const streamResponse: StreamResponse = {
        requestId,
        status: response.status,
        statusText: response.statusText,
        headers: this.normalizeHeaders(response.headers),
      };

      if (!response.body) {
        this.emit("end", { requestId, status: 0 } as EndPayload);
        return streamResponse;
      }

      const reader = response.body.getReader();

      this.processStream(reader, requestId).catch((error) => {
        this.emit("error", { requestId, error });
      });

      return streamResponse;
    } catch (error) {
      StreamFetch.activeRequests.delete(requestId);

      if (error instanceof Error) {
        if (error.name === "AbortError" || error.message.includes("aborted")) {
          this.emit("end", {
            requestId,
            status: 0,
          });
          return {
            requestId,
            status: 0,
            statusText: "Request cancelled by user",
            headers: {},
          };
        }

        // 网络错误或其他错误
        this.emit("error", {
          requestId,
          error: new Error(error.message),
        });

        return {
          requestId,
          status: 599,
          statusText: "Error",
          headers: {},
        };
      } else {
        this.emit("error", {
          requestId,
          error: new Error("Unknown error"),
        });
        return {
          requestId,
          status: 599,
          statusText: "Error",
          headers: {},
        };
      }
    }
  }

  private async processStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    requestId: number,
  ): Promise<void> {
    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          this.emit("end", { requestId, status: 0 } as EndPayload);
          break;
        }

        if (value) {
          // 将 Uint8Array 转换为 Buffer
          const chunk = Buffer.from(value);
          this.emit("chunk", { requestId, chunk } as ChunkPayload);
        }
      }
    } catch (error) {
      this.emit("error", { requestId, error: error as Error });
    } finally {
      reader.releaseLock();
      StreamFetch.activeRequests.delete(requestId);
    }
  }

  private normalizeHeaders(
    headers: Headers | Record<string, string | string[]>,
  ): Record<string, string> {
    const normalized: Record<string, string> = {};

    if (headers instanceof Headers) {
      // 处理 fetch API 的 Headers 对象
      headers.forEach((value, key) => {
        normalized[key] = value;
      });
    } else {
      // 处理普通对象
      for (const [key, value] of Object.entries(headers)) {
        if (typeof value === "string") {
          normalized[key] = value;
        } else if (Array.isArray(value)) {
          normalized[key] = value.join(", ");
        }
      }
    }
    return normalized;
  }
}
