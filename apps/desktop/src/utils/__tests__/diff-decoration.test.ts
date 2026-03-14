import { describe, expect, it } from "vitest";

import { buildLineOffsets } from "@/services/content-editing/snapshot";
import type { AppliedPatch } from "@/services/content-editing/types";
import { PositionMapper } from "../positionMapper";
import { patchesToDecorations } from "../diff-decoration";

const createTextMapper = (text: string) => {
  const mapper = new PositionMapper();
  mapper.addTextMapping({
    type: "text",
    slateTextPath: [0, 0],
    slateOffset: 0,
    slateLength: text.length,
    mdLine: 0,
    mdCh: 0,
    mdLength: text.length,
    prefixLength: 0,
    suffixLength: 0,
  });
  return mapper;
};

const createPatch = (patch: Partial<AppliedPatch>): AppliedPatch => ({
  operationId: "patch-1",
  op: "replace",
  start: 0,
  end: 0,
  beforeText: "",
  afterText: "",
  charDelta: 0,
  ...patch,
});

describe("patchesToDecorations", () => {
  it("应为纯删除操作生成可见的删除标记", () => {
    const proposalMarkdown = "abc";
    const ranges = patchesToDecorations(
      [
        createPatch({
          operationId: "delete-x",
          op: "delete",
          start: 1,
          end: 2,
          beforeText: "x",
          afterText: "",
          charDelta: -1,
        }),
      ],
      createTextMapper(proposalMarkdown),
      buildLineOffsets(proposalMarkdown),
      proposalMarkdown.length,
    );

    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({
      diffType: "delete",
      diffId: "delete-x",
      deletedText: "x",
      deletionAnchor: "before",
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [0, 0], offset: 2 },
    });
  });

  it("应为仅删短的 replace 操作生成删除标记", () => {
    const proposalMarkdown = "ab";
    const ranges = patchesToDecorations(
      [
        createPatch({
          operationId: "replace-trim",
          op: "replace",
          start: 0,
          end: 4,
          beforeText: "abcd",
          afterText: "ab",
          charDelta: -2,
        }),
      ],
      createTextMapper(proposalMarkdown),
      buildLineOffsets(proposalMarkdown),
      proposalMarkdown.length,
    );

    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({
      diffType: "delete",
      diffId: "replace-trim:delete:0",
      deletedText: "cd",
      deletionAnchor: "after",
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [0, 0], offset: 2 },
    });
  });

  it("应同时产出替换高亮和删除标记", () => {
    const proposalMarkdown = "axc";
    const ranges = patchesToDecorations(
      [
        createPatch({
          operationId: "replace-middle",
          op: "replace",
          start: 0,
          end: 3,
          beforeText: "abc",
          afterText: "axc",
          charDelta: 0,
        }),
      ],
      createTextMapper(proposalMarkdown),
      buildLineOffsets(proposalMarkdown),
      proposalMarkdown.length,
    );

    expect(ranges).toHaveLength(2);
    expect(ranges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          diffType: "replace",
          diffId: "replace-middle",
          anchor: { path: [0, 0], offset: 1 },
          focus: { path: [0, 0], offset: 2 },
        }),
        expect.objectContaining({
          diffType: "delete",
          diffId: "replace-middle:delete:0",
          deletedText: "b",
          deletionAnchor: "before",
          anchor: { path: [0, 0], offset: 1 },
          focus: { path: [0, 0], offset: 2 },
        }),
      ]),
    );
  });
});
