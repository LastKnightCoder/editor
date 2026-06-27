import { beforeEach, describe, expect, it, vi } from "vitest";

const mockContext = vi.hoisted(() => {
  return {
    invoke: vi.fn(),
  };
});

vi.mock("@/electron", () => ({
  invoke: mockContext.invoke,
}));

import { ensureVLNoteResource, reorderVLResources } from "../vibe-learning";

describe("ensureVLNoteResource", () => {
  beforeEach(() => {
    mockContext.invoke.mockReset();
  });

  it("新建资源时应自动加入索引队列", async () => {
    const resource = {
      id: 88,
      projectId: 7,
      sortIndex: 2048,
      createTime: Date.now(),
      updateTime: Date.now(),
      name: "学习大纲.md",
      originalPath: "note://9001",
      markdownPath: null,
      resourceType: "md",
      fileSize: null,
      duration: null,
      sourceType: "note",
      sourceMetaInfo: null,
      transcriptSegments: null,
    };

    mockContext.invoke
      .mockResolvedValueOnce({ resource, created: true })
      .mockResolvedValueOnce({ accepted: true, reason: "queued_new" });

    const result = await ensureVLNoteResource({
      projectId: 7,
      mainDbName: "main.db",
      contentId: 9001,
      title: "学习大纲",
      noteType: "outline",
      originalId: 11,
    });

    expect(result.created).toBe(true);
    expect(mockContext.invoke).toHaveBeenNthCalledWith(
      1,
      "vl-ensure-note-resource",
      {
        projectId: 7,
        contentId: 9001,
        title: "学习大纲",
        noteType: "outline",
        originalId: 11,
      },
    );
    expect(mockContext.invoke).toHaveBeenNthCalledWith(2, "vl-add-index-task", {
      resourceId: 88,
      projectId: 7,
      mainDbName: "main.db",
      originalPath: "note://9001",
      resourceName: "学习大纲.md",
      type: "full",
    });
  });

  it("显式关闭入索引时不应排队", async () => {
    const resource = {
      id: 99,
      projectId: 7,
      sortIndex: 2048,
      createTime: Date.now(),
      updateTime: Date.now(),
      name: "重点提炼.md",
      originalPath: "note://9002",
      markdownPath: null,
      resourceType: "md",
      fileSize: null,
      duration: null,
      sourceType: "note",
      sourceMetaInfo: null,
      transcriptSegments: null,
    };

    mockContext.invoke.mockResolvedValueOnce({ resource, created: true });

    const result = await ensureVLNoteResource({
      projectId: 7,
      mainDbName: "main.db",
      contentId: 9002,
      title: "重点提炼",
      noteType: "highlights",
      originalId: 22,
      enqueueIndex: false,
    });

    expect(result.created).toBe(true);
    expect(mockContext.invoke).toHaveBeenCalledTimes(1);
  });

  it("应调用重排资源 IPC", async () => {
    mockContext.invoke.mockResolvedValueOnce(3);

    const result = await reorderVLResources(7, [3, 2, 1]);

    expect(result).toBe(3);
    expect(mockContext.invoke).toHaveBeenCalledWith("vl-reorder-resources", {
      projectId: 7,
      orderedIds: [3, 2, 1],
    });
  });
});
