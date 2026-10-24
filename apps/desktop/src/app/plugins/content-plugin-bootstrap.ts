import { getPluginNodeTypes, assertUniqueEditorCodecs } from "@tau/plugins/rendering";
import { evaluateDesktopPluginPackage } from "../../../shared/plugin-rendering";
import { version as appVersion } from "../../../package.json";
import { createMarkdownProcessor } from "@tau/markdown";
import { isContentPlugin } from "@tau/plugins/package";
import { isElectron } from "@/electron";
import { scanLocalPlugins, getContentPluginStartup } from "@/commands/plugin-local";
import { getContentKit } from "@/services/editorKit";
import { desktopCodecComposition } from "@/utils/markdown";
import { desktopContentPlugins } from "../../../shared/content-plugins.ts";
import { bindPluginServiceRenderers } from "@tau/plugins/services-host";
import {
  addContentPlugin,
  initializeContentPluginState,
  setContentPluginIntent,
  setContentPluginError,
} from "./content-plugin-state";

/** 所有窗口在首次创建编辑器前固定贡献，不替换打开中的编辑器实例。 */
let startupTask: Promise<void> | undefined;
export function initializeContentPlugins() {
  return (startupTask ??= prepareContentPlugins().then(async () => {
    if (import.meta.env.DEV) {
      try {
        await (await import("./portable-development")).initializePortableDevelopment();
      } catch (error) {
        console.error("开发跨端插件加载失败", error);
      }
    }
  }));
}
async function prepareContentPlugins() {
  const base = getContentKit();
  initializeContentPluginState(base.elementTypes);
  if (!isElectron) return;
  try {
    const scan = await scanLocalPlugins();
    for (const entry of scan.entries) {
      if (
        entry.artifact &&
        (entry.artifact.manifest.formatVersion === 3 || isContentPlugin(entry.artifact.manifest))
      )
        setContentPluginIntent(entry.id, entry.enabled === true);
    }
    const snapshot = await getContentPluginStartup();
    for (const [id, error] of Object.entries(snapshot.errors)) setContentPluginError(id, error);
    if (!snapshot.artifacts.length) return;
    const { sharedPluginModules } = await import("./shared-modules");
    for (const artifact of snapshot.artifacts) {
      const id = artifact.manifest.id;
      try {
        const definition = bindPluginServiceRenderers(
          evaluateDesktopPluginPackage(artifact, sharedPluginModules, appVersion)
        );
        const candidates = [
          ...desktopContentPlugins.extensions,
          ...(definition.editorExtensions ?? []),
        ];
        base.extend({ extensions: candidates });
        getPluginNodeTypes(definition);
        const codecs = [
          ...desktopCodecComposition,
          ...desktopContentPlugins.codecs,
          ...(definition.editorCodecs ?? []),
        ];
        assertUniqueEditorCodecs(codecs);
        createMarkdownProcessor({ codecs });
        if (artifact.css) {
          const style = document.createElement("style");
          style.dataset.tauEditorPlugin = id;
          style.textContent = artifact.css;
          document.head.append(style);
        }
        addContentPlugin(artifact, definition);
      } catch (error) {
        setContentPluginError(id, error);
      }
    }
  } catch (error) {
    console.error("内容插件启动扫描失败", error);
  }
}
