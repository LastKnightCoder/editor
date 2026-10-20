import type { DevelopmentPluginPackage } from "@tau/plugins/host";

let artifacts: DevelopmentPluginPackage[] = [];
export const getContentPluginArtifacts = () => artifacts;
export function appendContentPluginArtifact(artifact: DevelopmentPluginPackage) {
  artifacts = [...artifacts, Object.freeze({ ...artifact })];
}
