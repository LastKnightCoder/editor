import path from "node:path";
import { readPluginFixtures } from "../../../../scripts/plugins/test-support/package-fixtures";
import { evaluatePluginPackage } from "@tau/plugins/rendering";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
import type { Descendant } from "slate";

// 发布包集成夹具的数据类型；生产宿主不登记插件专属节点。
declare module "@tau/plugins" {
  interface EditorElementMap {
    "custom-block": { type: "custom-block"; content: string; children: Descendant[] };
    "html-block": { type: "html-block"; html: string; children: Descendant[] };
    "html-inline": {
      type: "html-inline";
      html: string;
      openEdit?: boolean;
      children: Descendant[];
    };
  }
  interface EditorInlineElementMap {
    "html-inline": {
      type: "html-inline";
      html: string;
      openEdit?: boolean;
      children: Descendant[];
    };
  }
}

const packages = await readPluginFixtures(
  path.resolve(import.meta.dirname, "../../../../tests/fixtures/plugins/catalog.json")
);
export function pluginArtifact(id: string) {
  const artifact = packages.find(item => item.manifest.id === id);
  if (!artifact) throw new Error(`测试插件包缺失：${id}`);
  return artifact;
}
export const customBlockDefinition = evaluatePluginPackage(
  pluginArtifact("tau.custom-block"),
  sharedPluginModules
);
export const customBlockExtension = customBlockDefinition.editorExtensions![0];
export const htmlDefinition = evaluatePluginPackage(
  pluginArtifact("tau.html"),
  sharedPluginModules
);
export const htmlExtension = htmlDefinition.editorExtensions![0];
