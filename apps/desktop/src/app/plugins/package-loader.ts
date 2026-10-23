import type { DesktopPluginPackage as DevelopmentPluginPackage } from "../../../shared/plugin-package";
import { isContentPlugin } from "@tau/plugins/package";
import { version as appVersion } from "../../../package.json";
import { evaluateDesktopPluginPackage } from "../../../shared/plugin-rendering";
import {
  readDesktopPluginManifest,
  assertDesktopPluginCompatibility,
} from "../../../shared/plugin-package";
import { contentPluginDefinition } from "./content-plugin-state";
import { type PluginHost } from "@tau/plugins/host";

export type SharedPluginModules = Readonly<Record<string, unknown>>;

export function registerPluginPackage(
  host: PluginHost,
  artifact: DevelopmentPluginPackage,
  getModules: () => Promise<SharedPluginModules>
) {
  const manifest = readDesktopPluginManifest(artifact.manifest);
  assertDesktopPluginCompatibility(manifest, appVersion);
  // 登记只使用静态元信息，启用时才执行包快照。
  host.registerDeferred(manifest, async signal => {
    const modules = await getModules();
    signal.throwIfAborted();
    const definition = isContentPlugin(manifest)
      ? contentPluginDefinition(artifact)
      : evaluateDesktopPluginPackage(artifact, modules, appVersion);
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
