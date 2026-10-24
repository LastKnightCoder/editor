import { version as appVersion } from "../../../package.json";
import {
  evaluatePortablePluginPackage,
  getPluginNodeTypes,
  assertUniqueEditorCodecs,
} from "@tau/plugins/rendering";
import type { PluginDefinition } from "@tau/plugins";
import { invoke, isElectron } from "@/electron";
import { withModule } from "@/commands/module-init";
import { desktopPluginEnvironment } from "./environment";
import { desktopContentPlugins, desktopPortableSupport } from "../../../shared/content-plugins";
import type { PortableDevelopmentArtifact } from "../../../shared/portable-development";
import { getContentKit } from "@/services/editorKit";
import { desktopCodecComposition } from "@/utils/markdown";
import { markPortableDevelopmentLoaded } from "./content-plugin-state";

export const portableDevelopmentDefinitions: PluginDefinition[] = [];
export async function initializePortableDevelopment() {
  if (!import.meta.env.DEV || !isElectron) return;
  const artifacts = await withModule("plugin-local", () =>
    invoke<PortableDevelopmentArtifact[]>("plugin-local:portable-development")
  );
  const { sharedPluginModules } = await import("./shared-modules");
  for (const artifact of artifacts) {
    const definition = evaluatePortablePluginPackage(artifact, sharedPluginModules, {
      environment: desktopPluginEnvironment.getSnapshot(),
      appVersion,
      profiles: ["web-v1"],
    });
    getPluginNodeTypes(definition).forEach(type => desktopPortableSupport.set(type, "edit"));
    getContentKit().extend({
      extensions: [...desktopContentPlugins.extensions, ...(definition.editorExtensions ?? [])],
    });
    assertUniqueEditorCodecs([
      ...desktopCodecComposition,
      ...desktopContentPlugins.codecs,
      ...(definition.editorCodecs ?? []),
    ]);
    desktopContentPlugins.install([...desktopContentPlugins.list(), definition]);
    portableDevelopmentDefinitions.push(definition);
    markPortableDevelopmentLoaded();
    if (artifact.css) {
      const style = document.createElement("style");
      style.dataset.tauPortableDevelopment = definition.id;
      style.textContent = artifact.css;
      document.head.append(style);
    }
  }
}
