import { compileTailwind } from "@/commands";
import type { RuntimeStyleCompiler } from "@tau/shared/runtime-style";

export const desktopRuntimeStyleCompiler: RuntimeStyleCompiler = {
  compile: ({ source, language }) => compileRuntimeTailwind(source, language),
};

const inflight = new Map<string, Promise<string>>();
const cache = new Map<string, string>();

async function compileRuntimeTailwind(source: string, extension = "tsx"): Promise<string> {
  const trimmed = source?.trim();
  if (!trimmed) {
    return "";
  }
  const key = `${extension}::${trimmed}`;
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  let request = inflight.get(key);
  if (request === undefined) {
    request = compileTailwind({
      content: trimmed,
      extension,
    })
      .then(css => {
        cache.set(key, css);
        return css;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, request);
  }
  return request;
}
