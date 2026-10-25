import { beforeAll, describe, expect, it } from "vitest";

import { htmlSerializerRegistry } from "../html-serializers";

import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
beforeAll(() => useDynamicExtensionsStore.getState().initExtensions());

describe("wechat kbd serialization", () => {
  it("应将 kbd 行内元素序列化为带 class 的 kbd 标签", async () => {
    const html = await htmlSerializerRegistry.serializeAsync([
      {
        type: "paragraph",
        children: [
          { type: "formatted", text: "按下 " },
          {
            type: "kbd",
            children: [{ type: "formatted", text: "Cmd" }],
          },
          { type: "formatted", text: " + " },
          {
            type: "kbd",
            children: [{ type: "formatted", text: "K" }],
          },
        ],
      } as any,
    ]);

    expect(html).toContain('<kbd class="kbd">Cmd</kbd>');
    expect(html).toContain('<kbd class="kbd">K</kbd>');
  });
});
