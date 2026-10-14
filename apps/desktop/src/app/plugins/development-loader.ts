import type { PluginDefinition, PluginInstance } from "@tau/plugins";
import {
  validatePluginManifest,
  PLUGIN_SHARED_MODULES,
  type DevelopmentPluginPackage,
  type PluginHost,
} from "@tau/plugins/host";

export type SharedPluginModules = Readonly<Record<string, unknown>>;

export function registerDevelopmentPlugin(
  host: PluginHost,
  artifact: DevelopmentPluginPackage,
  getModules: () => Promise<SharedPluginModules>
) {
  const manifest = validatePluginManifest(artifact.manifest);
  // 登记只使用静态元信息；用户启用时才执行所选可信代码。
  host.registerTrusted({
    ...manifest,
    create() {
      let instance: PluginInstance | undefined;
      return {
        async activate(context) {
          const modules = await getModules();
          context.signal.throwIfAborted();
          const module: { exports: { default?: PluginDefinition } } = { exports: {} };
          const require = (id: string) => {
            if (!PLUGIN_SHARED_MODULES.some(name => name === id) || !Object.hasOwn(modules, id))
              throw new Error(`插件使用了未提供的宿主模块：${id}`);
            return modules[id];
          };
          new Function(
            "require",
            "module",
            "exports",
            '"use strict";\n' +
              artifact.code +
              `\n//# sourceURL=tau-plugin://${manifest.id}/${manifest.version}/main.js`
          )(require, module, module.exports);
          const definition = module.exports.default;
          if (
            !definition ||
            typeof definition.create !== "function" ||
            definition.id !== manifest.id ||
            definition.name !== manifest.name ||
            definition.version !== manifest.version ||
            definition.apiVersion !== manifest.apiVersion
          )
            throw new Error("插件入口定义与清单不一致");
          context.signal.throwIfAborted();
          if (artifact.css) {
            const style = document.createElement("style");
            style.dataset.tauPlugin = manifest.id;
            style.textContent = artifact.css;
            document.head.append(style);
            context.register({ dispose: () => style.remove() });
            context.signal.addEventListener("abort", () => style.remove(), { once: true });
          }
          instance = definition.create();
          if (!instance || typeof instance.activate !== "function")
            throw new Error("插件实例缺少 activate");
          await instance.activate(context);
        },
        async deactivate() {
          await instance?.deactivate?.();
          instance = undefined;
        },
      };
    },
  });
}
