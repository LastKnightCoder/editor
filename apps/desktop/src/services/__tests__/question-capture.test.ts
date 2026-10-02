import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureQuestion: vi.fn(),
  linkQuestionTargets: vi.fn(),
  linkQuestionChat: vi.fn(),
  resolveMaterials: vi.fn(),
}));
vi.mock("@/commands/question", () => ({
  captureQuestion: mocks.captureQuestion,
  linkQuestionTargets: mocks.linkQuestionTargets,
  linkQuestionChat: mocks.linkQuestionChat,
}));
vi.mock("@/services/open-material", () => ({ resolveMaterials: mocks.resolveMaterials }));

import {
  requestMaterialQuestionCapture,
  submitQuestionCapture,
  subscribeQuestionCapture,
} from "../question-capture";

const question = { id: 7 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.captureQuestion.mockResolvedValue({ question, groupTitle: "默认" });
});

describe("转为问题", () => {
  it("材料：唤起面板时带上出处，提交后挂成第一条材料", async () => {
    mocks.resolveMaterials.mockResolvedValue([{ meta: "微信读书 · 《置身事内》" }]);
    const listener = vi.fn();
    const unsubscribe = subscribeQuestionCapture(listener);
    await requestMaterialQuestionCapture({ kind: "excerpt", id: 3 });
    unsubscribe();
    const draft = listener.mock.calls[0][0];
    expect(draft).toMatchObject({ sourceLabel: "微信读书 · 《置身事内》" });

    await submitQuestionCapture(draft.source, "为什么", null);
    expect(mocks.captureQuestion).toHaveBeenCalledWith("为什么", null, expect.anything());
    expect(mocks.linkQuestionTargets).toHaveBeenCalledWith(
      7,
      [{ targetType: "excerpt", targetId: 3 }],
      {},
      expect.anything()
    );
  });

  it("来源已不存在时不建问题", async () => {
    mocks.resolveMaterials.mockResolvedValue([]);
    await expect(
      submitQuestionCapture(
        { kind: "material", target: { targetType: "pdf-annotation", targetId: 9 } },
        "为什么",
        null
      )
    ).rejects.toThrow("来源已不存在");
    expect(mocks.captureQuestion).not.toHaveBeenCalled();
  });

  it("对话：挂成探究对话并记下消息 id", async () => {
    await submitQuestionCapture(
      { kind: "chat", sessionId: "s-1", messageIds: ["e1"] },
      "为什么",
      "经济"
    );
    expect(mocks.linkQuestionChat).toHaveBeenCalledWith(
      7,
      { sessionId: "s-1", messageIds: ["e1"] },
      expect.anything()
    );
  });
});
