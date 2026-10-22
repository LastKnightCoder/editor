import { version as appVersion } from "../../../package.json";
import {
  evaluatePortablePluginPackage,
  adaptPortablePluginDefinition,
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
    const adapted = adaptPortablePluginDefinition(definition, artifact.manifest, "desktop");
    Object.entries(adapted.support).forEach(([type, value]) =>
      desktopPortableSupport.set(type, value)
    );
    getContentKit().extend({
      extensions: [
        ...desktopContentPlugins.extensions,
        ...(adapted.definition.editorExtensions ?? []),
      ],
    });
    assertUniqueEditorCodecs([
      ...desktopCodecComposition,
      ...desktopContentPlugins.codecs,
      ...(adapted.definition.editorCodecs ?? []),
    ]);
    desktopContentPlugins.install([...desktopContentPlugins.list(), adapted.definition]);
    portableDevelopmentDefinitions.push(definition);
    if (artifact.css) {
      const style = document.createElement("style");
      style.dataset.tauPortableDevelopment = definition.id;
      style.textContent = artifact.css;
      document.head.append(style);
    }
  }
}
