import type { RuntimeStyleCompiler, RuntimeStyleRequest } from "@tau/shared/runtime-style";

let worker: Worker | undefined;
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
let generation = 0;
let rejectRunning: ((error: Error) => void) | undefined;
const cache = new Map<string, string>();

export function disposeMobileRuntimeStyles() {
  generation++;
  worker?.terminate();
  worker = undefined;
  rejectRunning?.(new Error("样式编译会话已结束"));
  cache.clear();
}

function run(request: RuntimeStyleRequest) {
  worker ??= new Worker(new URL("./compiler.worker.ts", import.meta.url), { type: "module" });
  const current = worker;
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      current.terminate();
      if (worker === current) worker = undefined;
      finish(new Error("样式编译超时"));
    }, 10_000);
    const finish = (error?: Error, css = "") => {
      clearTimeout(timer);
      current.onmessage = null;
      current.onerror = null;
      rejectRunning = undefined;
      if (error) reject(error);
      else resolve(css);
    };
    rejectRunning = error => finish(error);
    current.onmessage = ({ data }: MessageEvent<{ css?: string; error?: string }>) => {
      if (typeof data.css === "string") finish(undefined, data.css);
      else finish(new Error(data.error ?? "样式编译响应无效"));
    };
    current.onerror = () => {
      current.terminate();
      if (worker === current) worker = undefined;
      finish(new Error("样式编译器启动失败"));
    };
    try {
      current.postMessage(request);
    } catch (error) {
      finish(error instanceof Error ? error : new Error("样式编译失败"));
    }
  });
}

export const mobileRuntimeStyleCompiler: RuntimeStyleCompiler = {
  async compile(request) {
    if (request.source.length > 1024 * 1024) throw new Error("样式源码超过 1 MiB");
    const key = `${request.language}:${request.source}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    if (pending >= 32) throw new Error("样式编译任务过多，请稍后重试");
    const current = generation;
    pending++;
    const result = queue
      .catch(() => undefined)
      .then(async () => {
        if (current !== generation) throw new Error("样式编译会话已结束");
        const css = await run(request);
        if (current !== generation) throw new Error("样式编译会话已结束");
        if (cache.size >= 32) cache.delete(cache.keys().next().value!);
        cache.set(key, css);
        return css;
      })
      .finally(() => {
        pending--;
      });
    queue = result;
    return result;
  },
};
