import { expect, it } from "vitest";
import { getMobileCompactKit, getMobileContentKit } from "../../services/editorKit";
import { mobileCardPreviewExtensions } from "../../features/cards/editorExtensions";
import { mobileContentPlugins } from "./content";
import { definePlugin, defineEditorExtension } from "@tau/plugins";

it("compact使用独立底座并保留已装插件扩展，不装正文业务专用扩展", () => {
  const previous = mobileContentPlugins.list();
  mobileContentPlugins.install([
    ...previous,
    definePlugin({
      id: "example.compact",
      name: "精简套件测试",
      version: "1",
      editorExtensions: [
        defineEditorExtension({
          id: "example.compact",
          elements: [
            { type: "example.compact", kind: "block", dataVersion: 1, render: () => null },
          ],
        }),
      ],
    }),
  ]);
  try {
    const full = getMobileContentKit();
    const compact = getMobileCompactKit();
    expect(compact).not.toBe(full);
    for (const extension of mobileCardPreviewExtensions) {
      expect(full.extensions.some(item => item.id === extension.id)).toBe(true);
      expect(compact.extensions.some(item => item.id === extension.id)).toBe(false);
    }
    for (const extension of mobileContentPlugins.extensions)
      expect(compact.extensions.some(item => item.id === extension.id)).toBe(true);
    expect(getMobileCompactKit()).toBe(compact);
    expect(compact.extensions.some(item => item.id === "example.compact")).toBe(true);
  } finally {
    mobileContentPlugins.install(previous);
  }
});
