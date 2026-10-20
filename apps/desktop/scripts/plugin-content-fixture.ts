import type { DevelopmentPluginPackage } from "@tau/plugins/host";
import { desktopContentPlugins } from "../shared/content-plugins.ts";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
import { evaluatePluginPackage, assertUniqueEditorCodecs } from "@tau/plugins/rendering";
import { createMarkdownProcessor } from "@tau/markdown";
import { desktopCodecComposition } from "../src/utils/markdown";

/** 受信任样本的预期值构造器，不能被应用运行时代码导入。 */
export function installContentTestFixture(artifact: DevelopmentPluginPackage) {
  const definition = evaluatePluginPackage(artifact, sharedPluginModules);
  const definitions = [...desktopContentPlugins.list(), definition];
  const codecs = [
    ...desktopCodecComposition,
    ...definitions.flatMap(item => item.editorCodecs ?? []),
  ];
  assertUniqueEditorCodecs(codecs);
  createMarkdownProcessor({ codecs });
  desktopContentPlugins.install(definitions);
}
