import { createHash, randomUUID } from "node:crypto";
import { createRequire, isBuiltin } from "node:module";
import { BackendRuntime } from "@tau/plugins/backend-runtime";
import {
  defineBackend,
  type BackendDefinition,
  type BackendContext,
  type BackendProcessResult,
} from "@tau/plugins/backend";
import { backendJson, type BackendRequest } from "@tau/plugins/backend-protocol";

const port = process.parentPort;
if (!port) throw new Error("插件后台必须由宿主启动");
const requireBuiltin = createRequire(process.execPath);
let runtime: BackendRuntime | undefined;
let initialized = false;
let generation = "";
const tools = new Map<
  string,
  { resolve(value: BackendProcessResult): void; reject(error: Error): void; cleanup(): void }
>();
const processTools: BackendContext["process"] = {
  run(toolId, args = [], options) {
    options?.signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const cancel = () => {
        port!.postMessage({ type: "tool-cancel", generation, id });
        finish(new Error("外部工具已取消"));
      };
      const timer = setTimeout(() => finish(new Error("外部工具响应超时")), 35_000);
      const cleanup = () => {
        clearTimeout(timer);
        options?.signal?.removeEventListener("abort", cancel);
        tools.delete(id);
      };
      const finish = (error: Error) => {
        cleanup();
        reject(error);
      };
      tools.set(id, { resolve, reject, cleanup });
      options?.signal?.addEventListener("abort", cancel, { once: true });
      try {
        port!.postMessage({
          type: "tool-call",
          generation,
          id,
          toolId,
          args: backendJson([...args]),
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error("外部工具请求失败"));
      }
    });
  },
};
let lastMessageAt = Date.now();
port.on("message", ({ data }) => {
  lastMessageAt = Date.now();
  void receive(data).catch(error => {
    port.postMessage({
      type: "error",
      generation,
      message: error instanceof Error ? error.message.slice(0, 1000) : "后台执行失败",
    });
    if (!runtime) process.exit(1);
  });
});
setInterval(() => {
  if (Date.now() - lastMessageAt < 30_000) return;
  void runtime?.stop().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
}, 5000).unref();

async function receive(data: unknown) {
  if (!initialized) {
    initialized = true;
    const input = data as {
      type: string;
      generation: string;
      code: string;
      digest: string;
      pluginId: string;
      workspaceId: string | null;
    };
    if (
      input?.type !== "init" ||
      typeof input.generation !== "string" ||
      typeof input.code !== "string" ||
      input.code.length > 32 * 1024 * 1024 ||
      createHash("sha256").update(input.code).digest("hex") !== input.digest
    )
      throw new Error("后台启动产物校验失败");
    generation = input.generation;
    runtime = new BackendRuntime(
      input,
      reply => {
        port!.postMessage(reply);
        if (reply.type === "stopped") setTimeout(() => process.exit(0), 0);
      },
      processTools
    );
    const module = { exports: {} as { default?: BackendDefinition } };
    new Function("require", "module", "exports", '"use strict";\n' + input.code)(
      (id: string) => {
        if (id === "@tau/plugins/backend") return { defineBackend };
        if (isBuiltin(id)) return requireBuiltin(id);
        throw new Error(`后台依赖未打包：${id}`);
      },
      module,
      module.exports
    );
    await runtime.activate(module.exports.default!);
  } else {
    const message = backendJson(data) as BackendRequest;
    if (!message || message.generation !== generation) return;
    if (message.type === "tool-result" || message.type === "tool-error") {
      const pending = tools.get(message.id);
      if (!pending) return;
      pending.cleanup();
      if (message.type === "tool-result") {
        const value = message.value as Record<string, unknown>;
        if (
          !value ||
          typeof value.exitCode !== "number" ||
          typeof value.stdout !== "string" ||
          typeof value.stderr !== "string"
        )
          pending.reject(new Error("外部工具结果无效"));
        else
          pending.resolve({ exitCode: value.exitCode, stdout: value.stdout, stderr: value.stderr });
      } else pending.reject(new Error(message.message));
    } else await runtime?.receive(data);
  }
}
