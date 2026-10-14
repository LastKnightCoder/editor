import { isElectron } from "@/electron";
import { currentCommandScope } from "@/services/command-context";
import { createBridgeFetch, type FetchReply } from "@/services/fetch-bridge";
import { ensureModule } from "./module-init";

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  // 取消消息不能被命令作用域的取消检查拦住。
  const result = await window.electron.invoke<FetchReply<T>>(channel, ...args);
  if (result.ok === false) {
    if (["AbortError", "TimeoutError"].includes(result.error.name))
      throw new DOMException(result.error.message, result.error.name);
    const error =
      result.error.name === "TypeError"
        ? new TypeError(result.error.message)
        : new Error(result.error.message);
    error.name = result.error.name;
    throw error;
  }
  return result.value;
}
const bridged = createBridgeFetch({
  open: request => call("fetch:open", request),
  upload: (id, chunk) => call("fetch:upload", id, chunk),
  response: id => call("fetch:response", id),
  read: id => call("fetch:read", id),
  cancel: id => call("fetch:cancel", id),
});

export const desktopFetch: typeof fetch = async (input, init) => {
  const scope = currentCommandScope();
  const source =
    init?.signal === undefined && input instanceof Request ? input.signal : init?.signal;
  const signal = AbortSignal.any(
    [scope?.signal, source].filter((value): value is AbortSignal => !!value)
  );
  signal.throwIfAborted();
  if (!isElectron) return globalThis.fetch(input, { ...init, signal });
  await ensureModule("fetch");
  signal.throwIfAborted();
  return bridged(input, { ...init, signal });
};
