import type { DesktopPluginPackage as DevelopmentPluginPackage } from "../../../shared/plugin-package";

let artifacts: DevelopmentPluginPackage[] = [];
export const getContentPluginArtifacts = () => artifacts;
export function appendContentPluginArtifact(artifact: DevelopmentPluginPackage) {
  artifacts = [...artifacts, Object.freeze({ ...artifact })];
}
