import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { CreateVLQuizRecordInput, VLQuizSet } from "@/types";

const { save } = vi.hoisted(() => ({
  save: vi.fn(async (input: CreateVLQuizRecordInput) => ({ ...input, id: 1, createTime: 0 })),
}));
vi.mock("../quizQueries", () => ({
  useQuizMutations: () => ({ createRecord: save }),
  useQuizItems: (quizSetId: number) => ({
    isSuccess: true,
    isFetching: false,
    isError: false,
    items: [
      {
        id: quizSetId,
        quizSetId,
        type: "boolean",
        prompt: [],
        detail: [],
        data: { booleanAnswer: true },
        tags: [],
        difficulty: "standard",
        sortOrder: 0,
        createTime: 0,
        updateTime: 0,
      },
    ],
  }),
}));
vi.mock("@/hooks/useTheme", () => ({ default: () => ({ isDark: false }) }));
vi.mock("../components/quiz/RichTextRenderer", () => ({ default: () => <p>题目</p> }));
vi.mock("../components/quiz/ClozeReviewRenderer", () => ({ default: () => null }));

import QuizTestModal from "../views/VibeLearningView/generate/apps/QuizTestModal";

const quiz = (id: number, projectId: number): VLQuizSet => ({
  id,
  projectId,
  name: `测验 ${id}`,
  description: "",
  emoji: "",
  resourceIds: [],
  prompt: null,
  itemCount: 1,
  createTime: 0,
  updateTime: 0,
});

describe("测验弹窗接线", () => {
  it("两个项目弹窗各自作答，提交保存自己的项目身份", async () => {
    save.mockClear();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const click = (index: number, text: string) => {
      const dialog = document.querySelectorAll('[role="dialog"]')[index];
      const button = Array.from(dialog?.querySelectorAll("button") ?? []).find(
        item => item.textContent?.trim() === text
      );
      if (!button) throw new Error(`未找到第 ${index} 个弹窗操作：${text}`);
      button.click();
    };
    try {
      await act(async () =>
        root.render(
          <>
            <QuizTestModal open quizSet={quiz(11, 7)} onClose={() => undefined} />
            <QuizTestModal open quizSet={quiz(12, 8)} onClose={() => undefined} />
          </>
        )
      );
      await act(async () => {
        await vi.waitFor(() =>
          expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2)
        );
      });
      await act(async () => click(0, "正确"));
      await act(async () => click(0, "提交答案"));
      await act(async () => click(1, "错误"));
      await act(async () => click(1, "提交答案"));
      await act(async () => click(0, "完成测验"));
      await act(async () => click(1, "完成测验"));
      expect(save).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ projectId: 7, quizSetId: 11, score: 100 })
      );
      expect(save).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ projectId: 8, quizSetId: 12, score: 0 })
      );
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
