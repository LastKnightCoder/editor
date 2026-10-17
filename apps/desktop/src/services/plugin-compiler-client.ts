import { invoke, on, off } from "@/electron";
import { ensureModule } from "@/commands/module-init";
import type { CompilerReply, CompilerRequest, CompilerFile } from "@/types/plugin-services";
import type { ServiceFile, ServiceOptions, MediaProgress } from "@tau/plugins";

export async function compilerFiles(
  files: ServiceFile[],
  signal?: AbortSignal
): Promise<CompilerFile[]> {
  const result: CompilerFile[] = [];
  for (const file of files) {
    signal?.throwIfAborted();
    result.push({ name: file.name, bytes: new Uint8Array(await file.data.arrayBuffer()) });
  }
  signal?.throwIfAborted();
  return result;
}

export async function invokeCompiler<T>(
  request: CompilerRequest,
  options: ServiceOptions & { onProgress?: (progress: MediaProgress) => void } = {}
): Promise<T> {
  options.signal?.throwIfAborted();
  await ensureModule("plugin-services");
  options.signal?.throwIfAborted();
  const id = await invoke<string>("plugin-services:open");
  const cancel = () => {
    void invoke("plugin-services:cancel", id).catch(() => undefined);
  };
  const progress = (_event: unknown, taskId: string, value: MediaProgress) => {
    if (taskId === id && !options.signal?.aborted) {
      try {
        options.onProgress?.(value);
      } catch (error) {
        console.error("插件媒体进度回调失败", error);
      }
    }
  };
  on("plugin-services:progress", progress);
  options.signal?.addEventListener("abort", cancel, { once: true });
  try {
    options.signal?.throwIfAborted();
    const reply = await invoke<CompilerReply<T>>("plugin-services:run", id, request);
    options.signal?.throwIfAborted();
    if (!reply.ok) {
      const error = new Error(reply.message);
      error.name = reply.name;
      throw error;
    }
    return reply.value;
  } finally {
    options.signal?.removeEventListener("abort", cancel);
    off("plugin-services:progress", progress);
    await invoke("plugin-services:close", id).catch(() => undefined);
  }
}
