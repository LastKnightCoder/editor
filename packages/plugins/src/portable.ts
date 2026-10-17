import {
  ContentPluginRegistry,
  installCompiledPlugins,
  type CompiledPluginPackage,
} from "./content.ts";

type PackageLoader = () => Promise<CompiledPluginPackage>;

/** 各端只提供包来源，注册、样式装配与启动去重共用同一条路径。 */
export function createPortableContentRuntime(loaders: () => Promise<readonly PackageLoader[]>) {
  const registry = new ContentPluginRegistry();
  let startup: Promise<void> | undefined;

  async function install() {
    const [sources, { sharedPluginModules }] = await Promise.all([
      loaders(),
      import("./shared-modules"),
      import("./source-editor-host"),
    ]);
    const packages = await Promise.all(sources.map(load => load()));
    const previous = registry.list();
    const styles: HTMLStyleElement[] = [];
    try {
      installCompiledPlugins(registry, packages, sharedPluginModules);
      for (const artifact of packages) {
        if (!artifact.css) continue;
        const style = document.createElement("style");
        style.dataset.tauEditorPlugin = artifact.manifest.id;
        style.textContent = artifact.css;
        styles.push(style);
        document.head.append(style);
      }
    } catch (error) {
      styles.forEach(style => style.remove());
      registry.install(previous);
      throw error;
    }
  }

  return {
    registry,
    initialize(): Promise<void> {
      return (startup ??= install().catch(error => {
        startup = undefined;
        throw error;
      }));
    },
  };
}
