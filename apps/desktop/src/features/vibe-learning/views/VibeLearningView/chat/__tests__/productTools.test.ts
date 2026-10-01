import { beforeEach, describe, expect, it, vi } from "vitest";

const { startVLTaskMock, getResourcesMock, createContentMock, createVLNoteMock, recordLineageMock } =
  vi.hoisted(() => ({
    startVLTaskMock: vi.fn(),
    getResourcesMock: vi.fn(),
    createContentMock: vi.fn(),
    createVLNoteMock: vi.fn(),
    recordLineageMock: vi.fn(),
  }));

vi.mock("../../tasks/runner", () => ({ startVLTask: startVLTaskMock }));
vi.mock("@/commands", () => ({ createContent: createContentMock }));
vi.mock("@/commands/lineage", () => ({ recordLineage: recordLineageMock }));
vi.mock("@/commands/vibe-learning", () => ({
  getVLResourcesByProjectId: getResourcesMock,
  createVLNote: createVLNoteMock,
}));
vi.mock("@/utils", () => ({
  importFromMarkdown: (md: string) => [{ type: "paragraph", children: [{ text: md }] }],
  getContentLength: () => 1,
}));

import { PPT_TEMPLATES } from "@/constants/ppt-templates";
import { useVLTaskStore } from "../../tasks/store";
import { createVibeLearningProductTools } from "../productTools";
import { VL_PRODUCT_RENDERER_KEY } from "../productPayload";

const [generateTool, saveNoteTool] = createVibeLearningProductTools(7, "main");

interface Result {
  content: string;
  isParameterError?: boolean;
  metadata: { render: { rendererKey: string; payload: Record<string, unknown> } };
}
const generate = async (args: Record<string, unknown>) =>
  (await generateTool.executor(args)) as unknown as Result;
const saveNote = async (args: Record<string, unknown>, conversationKey?: string) =>
  (await saveNoteTool.executor(
    args,
    conversationKey
      ? { toolCallId: "t", toolName: "vibe_learning_save_note", source: "test", conversationKey }
      : undefined
  )) as unknown as Result;

const resources = [
  { id: 1, name: "第一章.pdf", markdownPath: "/a.md" },
  { id: 2, name: "第二章.pdf", markdownPath: "/b.md" },
  { id: 3, name: "处理中.pdf", markdownPath: "" },
];

beforeEach(() => {
  vi.clearAllMocks();
  getResourcesMock.mockResolvedValue(resources);
  startVLTaskMock.mockImplementation(async () => {
    useVLTaskStore.getState().put({ id: "t1", title: "学习大纲" } as never);
    return { taskId: "t1", note: { id: 42 } };
  });
});

describe("vibe_learning_generate", () => {
  it("默认用全部已就绪资料，brief 作为生成要求，结果带产物卡片", async () => {
    const result = await generate({ kind: "outline", brief: "侧重第二章的递归" });
    expect(startVLTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "outline",
        projectId: 7,
        resourceIds: [1, 2],
        userPrompt: "侧重第二章的递归",
      })
    );
    expect(result.metadata.render.rendererKey).toBe(VL_PRODUCT_RENDERER_KEY);
    expect(result.metadata.render.payload).toMatchObject({
      projectId: 7,
      kind: "outline",
      taskId: "t1",
      noteId: 42,
      title: "学习大纲",
    });
  });

  it("PPT 没选风格时返回参数错误，引导用 ask-question 让用户选", async () => {
    const result = await generate({ kind: "ppt", brief: "x" });
    expect(result.isParameterError).toBe(true);
    expect(result.content).toContain("ask-question");
    expect(result.content).toContain(PPT_TEMPLATES[0].name);
    expect(startVLTaskMock).not.toHaveBeenCalled();
  });

  it("风格按名称换算成模板 id，未知名称报错并列出可选", async () => {
    const template = PPT_TEMPLATES[1];
    await generate({ kind: "ppt", brief: "x", style: template.name });
    expect(startVLTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: template.id })
    );

    const bad = await generate({ kind: "ppt", brief: "x", style: "不存在" });
    expect(bad.isParameterError).toBe(true);
  });

  it("文章缺省杂志长文；指定资料按名称匹配，未就绪 / 不存在的报错", async () => {
    await generate({ kind: "article", brief: "x", resources: ["第二章.pdf"] });
    expect(startVLTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ style: "magazine", resourceIds: [2] })
    );

    const bad = await generate({
      kind: "outline",
      brief: "x",
      resources: ["处理中.pdf"],
    });
    expect(bad.isParameterError).toBe(true);
    expect(bad.content).toContain("第一章.pdf");
  });

  it("不开放播客", async () => {
    const result = await generate({ kind: "podcast", brief: "x" });
    expect(result.isParameterError).toBe(true);
  });
});

describe("vibe_learning_save_note", () => {
  it("直接建内容与产物并刷新列表", async () => {
    createContentMock.mockResolvedValue(9);
    createVLNoteMock.mockResolvedValue({ id: 50 });
    const before = useVLTaskStore.getState().productVersion[7] ?? 0;

    const result = await saveNote({
      type: "outline",
      title: "递归大纲",
      markdown: "# 递归",
    });

    expect(createVLNoteMock).toHaveBeenCalledWith({
      projectId: 7,
      contentId: 9,
      title: "递归大纲",
      type: "outline",
    });
    expect(useVLTaskStore.getState().productVersion[7]).toBe(before + 1);
    expect(result.metadata.render.payload).toMatchObject({ noteId: 50, mode: "save" });
    expect(recordLineageMock).not.toHaveBeenCalled();
  });

  it("在对话里保存时，产物记谱系 saved_from（对话 → Notebook 笔记）", async () => {
    createContentMock.mockResolvedValue(9);
    createVLNoteMock.mockResolvedValue({ id: 51 });
    await saveNote(
      { type: "note", title: "要点", markdown: "要点" },
      "main\u0000vibe-learning-chat:chat-1"
    );
    expect(recordLineageMock).toHaveBeenCalledWith({
      src: { kind: "chat-session", id: "chat-1" },
      dst: { kind: "vl-note", id: 51 },
      relation: "saved_from",
    });
  });
});
