import {
  evaluatePluginPackage,
  getPluginNodeTypes,
  assertUniqueEditorCodecs,
} from "@tau/plugins/rendering";
import { createMarkdownProcessor } from "@tau/markdown";
import { isElectron } from "@/electron";
import { scanLocalPlugins, getEditorPluginStartup } from "@/commands/plugin-local";
import { getContentKit } from "@/services/editorKit";
import { desktopCodecComposition } from "@/utils/markdown";
import { desktopContentPlugins } from "../../../shared/content-plugins.ts";
import {
  addContentPlugin,
  initializeContentPluginState,
  localPluginStateKey,
  setContentPluginError,
} from "./content-plugin-state";

/** 所有窗口在首次创建编辑器前固定贡献，不替换打开中的编辑器实例。 */
let startupTask: Promise<void> | undefined;
export function initializeContentPlugins() {
  return (startupTask ??= prepareContentPlugins());
}
async function prepareContentPlugins() {
  const base = getContentKit();
  initializeContentPluginState(base.elementTypes);
  if (!isElectron) return;
  try {
    const scan = await scanLocalPlugins();
    for (const entry of scan.entries) {
      if (entry.artifact?.manifest.editor)
        localStorage.setItem(localPluginStateKey(entry.id), String(entry.editorEnabled === true));
    }
    const snapshot = await getEditorPluginStartup();
    for (const [id, error] of Object.entries(snapshot.errors)) setContentPluginError(id, error);
    if (!snapshot.artifacts.length) return;
    const { sharedPluginModules } = await import("./shared-modules");
    for (const artifact of snapshot.artifacts) {
      const id = artifact.manifest.id;
      try {
        const definition = evaluatePluginPackage(artifact, sharedPluginModules);
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
    console.error("编辑器插件启动扫描失败", error);
  }
}
