import { describe, expect, it } from "vitest";
import {
  BUILTIN_CONTENT_RESOURCES,
  assertContentResourceSpecs,
  collectContentResources,
  mapContentResources,
  mergeContentResources,
} from "@tau/db-schema/content-resources";

const declarations = mergeContentResources(BUILTIN_CONTENT_RESOURCES, {
  "example.gallery": [{ path: "sections[].images[].url", kind: "image", caption: "desc" }],
});

const nodes = [
  {
    type: "image",
    url: "a.png",
    previewUrl: "a-crop.png",
    children: [{ type: "formatted", text: "" }],
  },
  {
    type: "callout",
    children: [
      {
        type: "example.gallery",
        sections: [{ images: [{ url: "b.png" }, { url: "" }] }, { images: [{ url: "a.png" }] }],
        children: [{ type: "formatted", text: "" }],
      },
    ],
  },
  { type: "webview", url: "https://example.com", children: [{ type: "formatted", text: "" }] },
];

describe("正文资源声明", () => {
  it("按声明收集资源：显示版本一并收集，嵌套数组逐项展开，未声明的字段不算资源", () => {
    expect(collectContentResources(nodes, declarations)).toEqual([
      { url: "a.png", kind: "image" },
      { url: "a-crop.png", kind: "image" },
      { url: "b.png", kind: "image" },
    ]);
  });

  it("不可变改写：只换声明的字段，未改动的分支保持原引用", () => {
    const mapped = mapContentResources(nodes, declarations, url =>
      url === "a.png" ? "asset:a" : undefined
    );
    expect(mapped[0]).toMatchObject({ url: "asset:a", previewUrl: "a-crop.png" });
    const gallery = (mapped[1] as { children: { sections: { images: { url: string }[] }[] }[] })
      .children[0];
    expect(gallery.sections[0].images[0].url).toBe("b.png");
    expect(gallery.sections[1].images[0].url).toBe("asset:a");
    expect(gallery.sections[0]).toBe(
      (nodes[1] as { children: { sections: unknown[] }[] }).children[0].sections[0]
    );
    expect(mapped[2]).toBe(nodes[2]);
    expect(nodes[0]).toMatchObject({ url: "a.png" });
  });

  it("拒绝形状不对的声明", () => {
    for (const specs of [
      {},
      [{ path: "url" }],
      [{ path: "images[]", kind: "image" }],
      [{ path: "constructor.url", kind: "image" }],
      [{ path: "url", kind: "image", caption: "a.b" }],
      [{ path: "url", kind: "image", extra: true }],
      Array.from({ length: 17 }, () => ({ path: "url", kind: "image" })),
    ])
      expect(() => assertContentResourceSpecs(specs)).toThrow("资源声明无效");
    expect(() =>
      assertContentResourceSpecs([{ path: "a.b[].c", kind: "file", alt: "name" }])
    ).not.toThrow();
  });
});
