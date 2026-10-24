import type { PluginCapability } from "./capabilities";
import type { PortablePluginTarget } from "./portable";
import type { PluginDefinition, PluginContext } from "./contract";

/** 加载器统一绑定声明，作者在两端调用相同 API。 */
export function scopePortablePluginDefinition(
  definition: PluginDefinition,
  target: PortablePluginTarget<string>,
  available: readonly PluginCapability[]
): PluginDefinition {
  const required = new Set([...target.required, ...target.optional]);
  const assert = (feature: "fetch" | "sync" | "upload") => {
    if (!required.has(feature)) throw new Error(`插件未声明功能需求：${feature}`);
    if (!available.includes(feature)) throw new Error(`当前宿主未提供功能：${feature}`);
  };
  return {
    ...definition,
    create: () => {
      const instance = definition.create();
      return {
        activate(context) {
          const overrides: Pick<PluginContext, "fetch" | "sync" | "upload" | "settings"> = {
            fetch: async (input, init) => {
              assert("fetch");
              return context.fetch(input, init);
            },
            sync: {
              register: value => {
                assert("sync");
                return context.sync.register(value);
              },
            },
            upload: {
              register: value => {
                assert("upload");
                return context.upload.register(value);
              },
              uploadRemote: async (file, options) => {
                assert("upload");
                return context.upload.uploadRemote(file, options);
              },
            },
            settings: {
              register: value => {
                if (value.target === "sync" || value.target === "upload") assert(value.target);
                return context.settings.register(value);
              },
            },
          };
          const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(context);
          for (const [name, value] of Object.entries(overrides)) {
            if (typeof value === "object") Object.freeze(value);
            descriptors[name] = { enumerable: true, value };
          }
          const scoped = Object.freeze(
            Object.create(Object.getPrototypeOf(context), descriptors)
          ) as PluginContext;
          return instance.activate(scoped);
        },
        deactivate: () => instance.deactivate?.(),
      };
    },
  };
}

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
  const result: Record<string, unknown> = { ...modules, "@tau/plugins": Object.freeze(scoped) };
  if (!declared.has("whiteboard") || !available.includes("whiteboard"))
    delete result["@tau/plugins/whiteboard"];
  return result;
}
