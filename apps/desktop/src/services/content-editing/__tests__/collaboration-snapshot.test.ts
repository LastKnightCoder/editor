import { createTestDocument } from "@tau/collaboration/src/testing/node-document";
import { expect, it } from "vitest";
import type { Descendant } from "slate";
import { readNodeDocument } from "@tau/collaboration";
import { getMarkdown } from "@/utils/markdown";
import {
  removeActiveEditingSession,
  updateActiveEditingSessionContent,
  upsertActiveEditingSession,
} from "../active-editor-session";

it("协作文档还原后应使用 formatted 文本更新文章快照", async () => {
  const content = [
    { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    {
      type: "paragraph",
      children: [{ type: "formatted", text: "正文", bold: true }],
    },
  ] satisfies Descendant[];
  const doc = await createTestDocument(
    {
      title: "文章",
      bannerBg: "",
      bannerPosition: "center",
      content,
    },
    { documentId: "article", baselineId: "base", epoch: 0 }
  );
  const sessionId = "article-collaboration-snapshot";
  try {
    upsertActiveEditingSession({
      sessionId,
      contentId: 1,
      entityType: "article",
      entityId: 1,
      content,
    });
    const restored = readNodeDocument(doc).content as Descendant[];
    expect(restored[0]).toMatchObject({
      children: [{ type: "formatted", text: "" }],
    });
    const updated = updateActiveEditingSessionContent(sessionId, restored);

    expect(updated?.snapshot.markdown).toBe("**正文**\n");
    expect(getMarkdown(restored)).toBe("**正文**\n");
    expect(updated?.snapshot.positionMap.slateToMarkdown({ path: [1, 0], offset: 1 })).toEqual({
      line: 0,
      ch: 3,
    });
  } finally {
    removeActiveEditingSession(sessionId);
    doc.destroy();
  }
});
