import { EventEmitter } from 'node:events';
import axios, { AxiosRequestConfig } from 'axios';
import { ipcMain, WebContents } from 'electron';

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

    ipcMain.handle('stream-fetch', async (event, {
      method,
      url,
      headers,
      body
    }: {
      method: string,
      url: string,
      headers: Record<string, string>,
      body?: Buffer
    }) => {
      const requestId = await StreamFetch.getNextRequestId();
      StreamFetch.senders.set(requestId, event.sender);
      return await streamFetch.fetch(method, url, headers, body, requestId);
    });

    streamFetch.on('chunk', (payload: ChunkPayload) => {
      const { requestId } = payload;
      if (StreamFetch.senders.has(requestId)) {
        StreamFetch.senders.get(requestId)?.send('stream-response', payload);
      }
    });

    streamFetch.on('end', (payload: EndPayload) => {
      const { requestId } = payload;
      const sender = StreamFetch.senders.get(requestId);
      if (sender) {
        sender.send('stream-response', payload);
        StreamFetch.senders.delete(requestId);
      }
    });

    streamFetch.on('error', ({ requestId, error }: { requestId: number, error: Error }) => {
      const sender = StreamFetch.senders.get(requestId);
      if (sender) {
        sender.send('stream-response', { requestId, chunk: Buffer.from(error.message) });
        sender.send('stream-response', { requestId, status: 0 })
        StreamFetch.senders.delete(requestId);
      }
    });
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
    body: any,
    requestId: number,
  ): Promise<StreamResponse> {
    const config: AxiosRequestConfig = {
      method,
      url,
      headers,
      responseType: 'stream',
      maxRedirects: 3,
      timeout: 3000,
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      config.data = body;
    }

    try {
      const response = await axios(config);
      const streamResponse: StreamResponse = {
        requestId,
        status: response.status,
        statusText: response.statusText,
        headers: this.normalizeHeaders(response.headers),
      };

      response.data.on('data', (chunk: Buffer) => {
        this.emit('chunk', { requestId, chunk } as ChunkPayload);
      });

      response.data.on('end', () => {
        this.emit('end', { requestId, status: 0 } as EndPayload);
      });

      response.data.on('error', (error: Error) => {
        this.emit('error', { requestId, error });
      });

      return streamResponse;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 599;
        const statusText = error.response?.statusText || 'Error';
        const headers = error.response?.headers
          ? this.normalizeHeaders(error.response.headers)
          : {};

        this.emit('error', {
          requestId,
          error: new Error(error.message)
        });

        return {
          requestId,
          status,
          statusText,
          headers,
        };
      } else {
        return {
          requestId,
          status: 599,
          statusText: 'Error',
          headers: {},
        };
      }
    }
  }

  private normalizeHeaders(headers: any): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') {
        normalized[key] = value;
      } else if (Array.isArray(value)) {
        normalized[key] = value.join(', ');
      }
    }
    return normalized;
  }
}
