import { compileRuntimeStyles } from "./compile";
import type { RuntimeStyleRequest } from "@tau/shared/runtime-style";

self.onmessage = async ({ data }: MessageEvent<RuntimeStyleRequest>) => {
  try {
    self.postMessage({ css: await compileRuntimeStyles(data) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "样式编译失败" });
  }
};
