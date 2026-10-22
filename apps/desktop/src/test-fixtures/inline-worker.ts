import { vi } from "vitest";

// jsdom 的 Blob 没有 text()
const readText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

/**
 * 在当前线程执行 Blob 脚本的 Worker 替身：jsdom 不提供 Worker，插件发布包按真实脚本与消息协议运行。
 * 脚本内的 globalThis / self 指向独立作用域（onmessage + postMessage），消息异步投递。
 */
export function stubInlineWorker() {
  const blobs = new Map<string, Blob>();
  let nextUrl = 0;

  class InlineWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    private terminated = false;
    private ready: Promise<(data: unknown) => void>;

    constructor(url: string | URL) {
      // 调用方构造后会立即 revoke，这里先取走 Blob
      const blob = blobs.get(String(url));
      if (!blob) throw new Error(`未知的 Worker 脚本：${url}`);
      this.ready = readText(blob).then(source => {
        const scope = {
          onmessage: null as ((event: { data: unknown }) => void) | null,
          postMessage: (data: unknown) =>
            setTimeout(() => !this.terminated && this.onmessage?.({ data })),
        };
        new Function("globalThis", "self", source)(scope, scope);
        return (data: unknown) => scope.onmessage?.({ data });
      });
    }

    postMessage(data: unknown) {
      void this.ready
        .then(receive => setTimeout(() => !this.terminated && receive(structuredClone(data))))
        .catch(error =>
          this.onerror?.({
            message: String(error?.message ?? error),
            preventDefault: () => undefined,
          })
        );
    }

    terminate() {
      this.terminated = true;
    }
  }

  vi.stubGlobal("Worker", InlineWorker);
  vi.spyOn(URL, "createObjectURL").mockImplementation(object => {
    const url = `blob:inline-worker/${++nextUrl}`;
    blobs.set(url, object as Blob);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(url => {
    blobs.delete(url);
  });
}
