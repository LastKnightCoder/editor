import type { PortablePluginManifest } from "@tau/plugins/portable";
export interface PortableDevelopmentArtifact {
  manifest: PortablePluginManifest;
  code: string;
  css?: string;
}
