import type { ReadablePortablePluginManifest } from "@tau/plugins/portable";
export interface PortableDevelopmentArtifact {
  manifest: ReadablePortablePluginManifest;
  code: string;
  css?: string;
}
