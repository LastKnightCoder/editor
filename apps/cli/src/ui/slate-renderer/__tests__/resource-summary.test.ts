import { expect, it } from "vitest";
import { BUILTIN_CONTENT_RESOURCES } from "@tau/db-schema/content-resources";
import { resourceSummary } from "../render-node.js";
import type { TerminalRendererContext } from "../types.js";

const context: TerminalRendererContext = {
  terminalWidth: 80,
  listDepth: 0,
  renderNodes: () => null,
  renderNode: () => null,
  resources: {
    ...BUILTIN_CONTENT_RESOURCES,
    "example.media": [
      { path: "images[].url", kind: "image" },
      { path: "clip", kind: "video" },
    ],
  },
};

it("没有专门渲染器的节点按资源声明显示数量，未声明的节点不显示", () => {
  expect(
    resourceSummary(
      {
        type: "example.media",
        images: [{ url: "a.png" }, { url: "b.png" }],
        clip: "v.mp4",
        children: [],
      },
      context
    )
  ).toBe("2 images · 1 video");
  expect(resourceSummary({ type: "audio", src: "a.mp3", children: [] }, context)).toBe("1 audio");
  expect(resourceSummary({ type: "example.other", url: "a.png", children: [] }, context)).toBe("");
});
