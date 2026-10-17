import { isContentPlugin } from "@tau/plugins/package";
import { evaluatePluginPackage } from "@tau/plugins/rendering";
import { contentPluginDefinition } from "./content-plugin-state";
import {
  validatePluginManifest,
  type DevelopmentPluginPackage,
  type PluginHost,
} from "@tau/plugins/host";

export type SharedPluginModules = Readonly<Record<string, unknown>>;

export function registerPluginPackage(
  host: PluginHost,
  artifact: DevelopmentPluginPackage,
  getModules: () => Promise<SharedPluginModules>
) {
  const manifest = validatePluginManifest(artifact.manifest);
  // 登记只使用静态元信息，启用时才执行包快照。
  host.registerDeferred(manifest, async signal => {
    const modules = await getModules();
    signal.throwIfAborted();
    const definition = isContentPlugin(manifest)
      ? contentPluginDefinition(artifact)
      : evaluatePluginPackage(artifact, modules);
    signal.throwIfAborted();
    return {
      ...definition,
      create() {
        const instance = definition.create();
        if (!instance || typeof instance.activate !== "function")
          throw new Error("插件实例缺少 activate");
        return {
          async activate(context) {
            if (artifact.css && !isContentPlugin(manifest)) {
              const style = document.createElement("style");
              style.dataset.tauPlugin = manifest.id;
              style.textContent = artifact.css;
              document.head.append(style);
              context.register({ dispose: () => style.remove() });
              context.signal.addEventListener("abort", () => style.remove(), { once: true });
            }
            await instance.activate(context);
          },
          async deactivate() {
            await instance.deactivate?.();
          },
        };
      },
    };
  });
}
