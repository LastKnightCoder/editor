import { evaluatePluginPackage, evaluatePortablePluginPackage } from "@tau/plugins/rendering";
import { desktopPortableHost, type DesktopPluginPackage } from "./plugin-package";
import { isWebPluginManifest } from "@tau/plugins/unified";

/** 正式页面与独立内容进程共用求值和平台投影，包清单保持原格式。 */
export function evaluateDesktopPluginPackage(
  artifact: DesktopPluginPackage,
  modules: Readonly<Record<string, unknown>>,
  appVersion: string
) {
  if (!isWebPluginManifest(artifact.manifest))
    return evaluatePluginPackage({ ...artifact, manifest: artifact.manifest }, modules);
  return evaluatePortablePluginPackage(
    { ...artifact, manifest: artifact.manifest },
    modules,
    desktopPortableHost(appVersion)
  );
}
