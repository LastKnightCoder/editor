import { expect, it } from "vitest";
import { captureScopedTextEdit, NodeTree } from "@tau/collaboration";
import { createTestDocument } from "@tau/collaboration/src/testing/node-document";
import { resolveHistoricalTextRange } from "../ContentEditor/suggestionPreview";

it("正文基线重建后，历史回看只定位同一块中唯一的已应用文字", async () => {
  const makeDoc = (baselineId: string, text: string, blockId = "block") =>
    createTestDocument(
      {
        title: "",
        bannerBg: "",
        bannerPosition: "center",
        content: [{ type: "paragraph", collabId: blockId, children: [{ text }] }],
      },
      { documentId: "card", baselineId, epoch: 0 }
    );
  const old = await makeDoc("old", "前缀已应用结尾");
  const current = await makeDoc("new", "加长的前缀已应用结尾");
  const ambiguous = await makeDoc("other", "已应用、已应用");
  const missing = await makeDoc("missing", "加长的前缀已应用结尾", "different");
  const oldTree = new NodeTree(old);
  const tree = new NodeTree(current);
  const ambiguousTree = new NodeTree(ambiguous);
  const missingTree = new NodeTree(missing);
  try {
    const edit = captureScopedTextEdit(oldTree, "operation", "block", 2, 5, "");
    expect(resolveHistoricalTextRange(tree, edit)).toEqual({ start: 5, end: 8 });
    expect(resolveHistoricalTextRange(ambiguousTree, edit)).toBeNull();
    expect(resolveHistoricalTextRange(missingTree, edit)).toBeNull();
  } finally {
    for (const value of [oldTree, tree, ambiguousTree, missingTree]) value.dispose();
    for (const doc of [old, current, ambiguous, missing]) doc.destroy();
  }
});
