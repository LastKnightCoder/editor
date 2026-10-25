import type { DesktopPluginPackage as DevelopmentPluginPackage } from "../../../shared/plugin-package";

let artifacts: DevelopmentPluginPackage[] = [];
let startupErrors: Readonly<Record<string, string>> = {};
export function setLegacyPluginStartupErrors(errors: Readonly<Record<string, string>>) {
  startupErrors = { ...errors };
}
export function assertLegacyPluginStartupReady() {
  const failure = Object.entries(startupErrors)[0];
  if (failure) throw new Error(`插件 ${failure[0]} 未能加载，暂不转换原内容：${failure[1]}`);
}
export const getContentPluginArtifacts = () => artifacts;
export function appendContentPluginArtifact(artifact: DevelopmentPluginPackage) {
  artifacts = [...artifacts, Object.freeze({ ...artifact })];
}
