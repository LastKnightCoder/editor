import type { PluginCapability } from "./capabilities";
import type { PortablePluginTarget } from "./portable";

/** 按包声明装配服务，作者无需在每次调用前查询宿主能力。 */
export function scopePortablePluginModules(
  modules: Readonly<Record<string, unknown>>,
  target: PortablePluginTarget<string>,
  available: readonly PluginCapability[]
) {
  const sdk = modules["@tau/plugins"] as Record<string, unknown> | undefined;
  if (!sdk) return modules;
  const declared = new Set([...target.required, ...target.optional]);
  const scoped = { ...sdk };
  const assertDeclared = (feature: string) => {
    if (!declared.has(feature)) throw new Error(`插件未声明功能需求：${feature}`);
  };
  const exports: Record<string, readonly string[]> = {
    editor: ["insertSourceBlock", "insertInlineSource", "sourceBlockParagraphBehavior"],
    sourceEditor: [
      "SourceBlockEditor",
      "useSourceBlock",
      "useInlineSource",
      "InlineSourceBoundary",
      "useReportPreviewError",
    ],
    media: [
      "useResource",
      "useResourceUpload",
      "useMediaAppearance",
      "useMediaViewer",
      "MediaImage",
      "MediaVideo",
      "MediaAudio",
    ],
  };
  for (const [feature, names] of Object.entries(exports)) {
    for (const name of names) {
      const implementation = sdk[name];
      if (typeof implementation !== "function") continue;
      scoped[name] = (...args: unknown[]) => {
        assertDeclared(feature);
        const result = implementation(...args);
        if (name !== "useSourceBlock" && name !== "useInlineSource") return result;
        return Object.defineProperty({ ...result }, "compiler", {
          enumerable: true,
          get() {
            assertDeclared("runtimeStyles");
            if (!available.includes("runtimeStyles")) return undefined;
            if (!result.compiler && target.required.includes("runtimeStyles"))
              throw new Error("当前编辑器未提供必需的样式编译服务");
            return result.compiler;
          },
        });
      };
    }
  }
  return { ...modules, "@tau/plugins": Object.freeze(scoped) };
}
