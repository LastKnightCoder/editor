import { evaluatePluginPackage, evaluatePortablePluginPackage } from "@tau/plugins/rendering";
import { desktopPortableHost, type DesktopPluginPackage } from "./plugin-package";

/** 正式页面与独立内容进程共用求值和平台投影，包清单保持原格式。 */
export function evaluateDesktopPluginPackage(
  artifact: DesktopPluginPackage,
  modules: Readonly<Record<string, unknown>>,
  appVersion: string
) {
  if (artifact.manifest.formatVersion !== 3)
    return evaluatePluginPackage({ ...artifact, manifest: artifact.manifest }, modules);
  return evaluatePortablePluginPackage(
    { ...artifact, manifest: artifact.manifest },
    modules,
    desktopPortableHost(appVersion)
  );
}
