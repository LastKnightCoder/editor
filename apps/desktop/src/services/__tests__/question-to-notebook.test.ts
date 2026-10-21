import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createVibeLearningProject: vi.fn(),
  ensureVLNoteResource: vi.fn(),
  createVLResource: vi.fn(),
  addVLIndexTask: vi.fn(),
  recordLineage: vi.fn(),
  updateQuestionStatus: vi.fn(),
}));
vi.mock("@/commands/vibe-learning-project", () => ({
  createVibeLearningProject: mocks.createVibeLearningProject,
}));
vi.mock("@/commands/vibe-learning", () => ({
  ensureVLNoteResource: mocks.ensureVLNoteResource,
  createVLResource: mocks.createVLResource,
  addVLIndexTask: mocks.addVLIndexTask,
}));
vi.mock("@/commands/lineage", () => ({ recordLineage: mocks.recordLineage }));
vi.mock("@/commands/question", () => ({ updateQuestionStatus: mocks.updateQuestionStatus }));
vi.mock("@/queryClient", () => ({ queryClient: { invalidateQueries: vi.fn() } }));

import type { QuestionDetail, QuestionMaterial } from "@/types";
import {
  planNotebookResources,
  plannedResourceCount,
  upgradeQuestionToNotebook,
} from "../question-to-notebook";

const material = (
  targetType: QuestionMaterial["targetType"],
  targetId: number,
  extra: Partial<QuestionMaterial> = {}
) =>
  ({
    id: targetId,
    questionId: 1,
    targetType,
    targetId,
    sortIndex: 0,
    createTime: 0,
    title: `${targetType}-${targetId}`,
    excerpt: "",
    meta: "",
    words: 0,
    targetCreateTime: 0,
    contentId: null,
    projectId: null,
    boardContentId: null,
    missing: false,
    ...extra,
  }) as QuestionMaterial;

const detail = (status: QuestionDetail["question"]["status"] = "not_started") =>
  ({
    question: { id: 1, questionContent: "为什么", status, description: [] },
    materials: [
      material("card", 10, { contentId: 100 }),
      material("answer", 200, { contentId: 200 }),
      material("excerpt", 3),
      material("pdf-annotation", 4),
      material("web-clip", 5),
      material("white_board", 6),
      material("card", 11, { contentId: 101, missing: true }),
    ],
    chats: [{ sessionId: "s" }],
    events: [],
    notebook: null,
  }) as unknown as QuestionDetail;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createVibeLearningProject.mockResolvedValue({ id: 9 });
  mocks.updateQuestionStatus.mockResolvedValue({});
  mocks.createVLResource.mockImplementation(async (p: { name: string }) => ({
    id: 1,
    originalPath: "material://",
    name: p.name,
  }));
});

describe("以此立项", () => {
  it("材料分类：正文与答案作笔记，摘录与标注合并，剪藏各一份，其余不带入", () => {
    const plan = planNotebookResources(detail());
    expect(plan.notes.map(n => [n.contentId, n.noteType])).toEqual([
      [100, "card"],
      [200, "answer"],
    ]);
    expect(plan.excerpts).toEqual([
      { kind: "excerpt", id: 3 },
      { kind: "pdf-annotation", id: 4 },
    ]);
    expect(plan.clips).toHaveLength(1);
    expect(plan.skipped).toBe(3); // 白板、已删除的卡片、对话
    expect(plannedResourceCount(plan)).toBe(4);
  });

  it("建 Notebook、带入资源、记谱系并转为探究中；单份失败不影响其余", async () => {
    mocks.ensureVLNoteResource.mockRejectedValueOnce(new Error("x"));
    const result = await upgradeQuestionToNotebook(detail(), "main");
    expect(result).toEqual({ projectId: 9, failed: 1 });
    expect(mocks.recordLineage).toHaveBeenCalledWith({
      src: { kind: "question", id: 1 },
      dst: { kind: "vl-project", id: 9 },
      relation: "upgraded_to",
    });
    expect(mocks.createVLResource).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mocks.createVLResource.mock.calls[0][0].sourceMetaInfo).refs).toHaveLength(2);
    expect(mocks.addVLIndexTask).toHaveBeenCalledTimes(2);
    expect(mocks.updateQuestionStatus).toHaveBeenCalledWith(1, "in_progress", expect.anything());
  });

  it("已在探究中的问题不改状态", async () => {
    await upgradeQuestionToNotebook(detail("in_progress"), "main");
    expect(mocks.updateQuestionStatus).not.toHaveBeenCalled();
  });
});

describe("带资料新建 Notebook（通用）", () => {
  it("没有来源时不记谱系；空标题用默认标题；影响行说明带入与跳过", async () => {
    const { createNotebookWithResources, notebookPlanImpact } =
      await import("../notebook-creation");
    const plan = {
      notes: [{ contentId: 7, title: "问题", noteType: "plugin-entity", originalId: 3 }],
      excerpts: [],
      clips: [],
      skipped: 2,
    };
    expect(await createNotebookWithResources({ title: " ", plan, mainDbName: "main" })).toEqual({
      projectId: 9,
      failed: 0,
    });
    expect(mocks.createVibeLearningProject).toHaveBeenCalledWith({ title: "未命名课题" });
    expect(mocks.recordLineage).not.toHaveBeenCalled();
    expect(mocks.ensureVLNoteResource).toHaveBeenCalledWith({
      projectId: 9,
      mainDbName: "main",
      contentId: 7,
      title: "问题",
      noteType: "plugin-entity",
      originalId: 3,
    });
    expect(notebookPlanImpact(plan)).toBe(
      "带入 1 份资料；2 项（项目、白板、对话或已删除的内容）不会带入"
    );
  });
});
