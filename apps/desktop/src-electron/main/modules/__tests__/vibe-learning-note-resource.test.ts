import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("../tables/operation", () => ({
  default: {
    insertOperation: vi.fn(),
  },
}));

import VibeLearningResourceTable from "../tables/vibe-learning-resource";

describe("VibeLearningResourceTable.ensureNoteResource", () => {
  const dummyDb = {} as never;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("命中同项目同 contentId 时应直接复用已有资源", () => {
    const existingResource = {
      id: 1,
      projectId: 101,
      sortIndex: 2048,
      createTime: 1,
      updateTime: 1,
      name: "学习大纲.md",
      originalPath: "note://9001",
      markdownPath: null,
      resourceType: "md",
      fileSize: null,
      duration: null,
      sourceType: "note",
      sourceMetaInfo: null,
      isChunked: false,
      chapterCount: 0,
      transcriptSegments: null,
    } as const;

    const getSpy = vi
      .spyOn(VibeLearningResourceTable, "getNoteResourceByContentId")
      .mockReturnValue(existingResource);
    const createSpy = vi.spyOn(VibeLearningResourceTable, "createResource");

    const result = VibeLearningResourceTable.ensureNoteResource(dummyDb, {
      projectId: 101,
      contentId: 9001,
      title: "学习大纲",
      noteType: "outline",
      originalId: 11,
    });

    expect(result).toEqual({
      resource: existingResource,
      created: false,
    });
    expect(getSpy).toHaveBeenCalledWith(dummyDb, 101, 9001);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("未命中时应创建 note 资源并写入 note://contentId", () => {
    const createdResource = {
      id: 2,
      projectId: 202,
      sortIndex: 2048,
      createTime: 1,
      updateTime: 1,
      name: "重点提炼.md",
      originalPath: "note://9002",
      markdownPath: null,
      resourceType: "md",
      fileSize: null,
      duration: null,
      sourceType: "note",
      sourceMetaInfo: null,
      isChunked: false,
      chapterCount: 0,
      transcriptSegments: null,
    } as const;

    vi.spyOn(
      VibeLearningResourceTable,
      "getNoteResourceByContentId",
    ).mockReturnValue(null);
    const createSpy = vi
      .spyOn(VibeLearningResourceTable, "createResource")
      .mockReturnValue(createdResource);

    const result = VibeLearningResourceTable.ensureNoteResource(dummyDb, {
      projectId: 202,
      contentId: 9002,
      title: "重点提炼",
      noteType: "highlights",
      originalId: 22,
    });

    expect(result).toEqual({
      resource: createdResource,
      created: true,
    });
    expect(createSpy).toHaveBeenCalledWith(
      dummyDb,
      expect.objectContaining({
        projectId: 202,
        name: "重点提炼.md",
        originalPath: "note://9002",
        resourceType: "md",
        sourceType: "note",
      }),
    );
    expect(createSpy.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        sourceMetaInfo: JSON.stringify({
          contentId: 9002,
          type: "highlights",
          title: "重点提炼",
          originalId: 22,
        }),
      }),
    );
  });
});
