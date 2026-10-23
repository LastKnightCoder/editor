import { afterEach, expect, it } from "vitest";
import { portableFixtures } from "../../../../../tests/fixtures/plugins/portable.mjs";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { ContentPluginRegistry, createPluginMarkdownProcessor } from "@tau/plugins/content";
import type { Descendant } from "slate";
import { evaluateDesktopPluginPackage } from "../../../shared/plugin-rendering";
import {
  readDesktopPluginManifest,
  type DesktopPluginPackage,
} from "../../../shared/plugin-package";
import { addContentPlugin } from "@/app/plugins/content-plugin-state";
import { registerPluginPackage } from "@/app/plugins/package-loader";
import { desktopContentPlugins, desktopPortableSupport } from "../../../shared/content-plugins";

afterEach(() => {
  desktopContentPlugins.install([]);
  desktopPortableSupport.clear();
});

it("同一跨端 ABC 产物通过正式页面加载器启用，并保留正文与 Markdown codec", async () => {
  const input = (await portableFixtures()).find(item => item.manifest.id === "tau.abc");
  if (!input) throw new Error("缺少 ABC 验证产物");
  const artifact: DesktopPluginPackage = {
    ...input,
    manifest: readDesktopPluginManifest(input.manifest),
  };
  expect(artifact.manifest.formatVersion).toBe(3);
  const definition = evaluateDesktopPluginPackage(artifact, sharedPluginModules, "0.59.1");
  expect(definition.editorExtensions?.[0].blockPanel).toEqual(
    expect.arrayContaining([expect.objectContaining({ title: "音乐标注" })])
  );
  const registry = new ContentPluginRegistry();
  registry.install([definition]);
  const processor = createPluginMarkdownProcessor({}, registry);
  const source = "X:1\nT:跨端验证\nM:4/4\nK:C\nC D E F |";
  const nodes = [
    { type: "abc", content: source, children: [{ type: "formatted", text: "" }] },
  ] as unknown as Descendant[];
  expect(processor.importFromMarkdown(processor.getMarkdown(nodes))).toEqual(nodes);
  addContentPlugin(artifact, definition);
  expect(desktopPortableSupport.get("abc")).toBe("edit");
  const host = new PluginHost({ workspaceId: "portable-abc", storage: createMemoryStorage() });
  try {
    registerPluginPackage(host, artifact, async () => sharedPluginModules);
    await host.enable("tau.abc");
    expect(host.listPlugins()[0].state).toBe("active");
  } finally {
    await host.dispose();
  }
});
