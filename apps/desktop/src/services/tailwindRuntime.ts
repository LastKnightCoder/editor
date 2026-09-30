import { compileTailwind } from "@/commands";
import type { RuntimeStyleCompiler } from "@tau/shared/runtime-style";

export const desktopRuntimeStyleCompiler: RuntimeStyleCompiler = {
  compile: ({ source, language }) => compileCustomBlockTailwind(source, language),
};

const inflight = new Map<string, Promise<string>>();
const cache = new Map<string, string>();

export async function compileCustomBlockTailwind(
  source: string,
  extension = "tsx"
): Promise<string> {
  const trimmed = source?.trim();
  if (!trimmed) {
    return "";
  }
  const key = `${extension}::${trimmed}`;
  if (cache.has(key)) {
    return cache.get(key)!;
  }
  if (!inflight.has(key)) {
    const request = compileTailwind({
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
  return inflight.get(key)!;
}
