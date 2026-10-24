import type { DesktopPluginPackage as DevelopmentPluginPackage } from "../../../shared/plugin-package";
import { isContentPlugin } from "@tau/plugins/package";
import { version as appVersion } from "../../../package.json";
import { hasPluginContent } from "@tau/plugins/rendering";
import { evaluateDesktopPluginPackage } from "../../../shared/plugin-rendering";
import {
  readDesktopPluginManifest,
  assertDesktopPluginCompatibility,
} from "../../../shared/plugin-package";
import {
  contentPluginDefinition,
  contentPluginLoaded,
  rememberContentPlugin,
} from "./content-plugin-state";
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
    const definition =
      contentPluginLoaded(manifest.id) ||
      (manifest.formatVersion !== 3 && isContentPlugin(manifest))
        ? contentPluginDefinition(artifact)
        : evaluateDesktopPluginPackage(artifact, modules, appVersion);
    if (hasPluginContent(definition)) {
      rememberContentPlugin(artifact);
      if (!contentPluginLoaded(manifest.id)) throw new Error("内容插件需重启应用后加载");
    }
    signal.throwIfAborted();
    return {
      ...definition,
      create() {
        const instance = definition.create();
        if (!instance || typeof instance.activate !== "function")
          throw new Error("插件实例缺少 activate");
        return {
          async activate(context) {
            if (artifact.css && !hasPluginContent(definition)) {
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
