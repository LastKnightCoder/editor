import { describe, expect, it, vi } from "vitest";
import type { PiSessionInteractionSnapshot } from "@/types/pi-session";
import { PiSessionInteractions } from "../pi-session-interactions";

const params = {
  questions: [{ id: "q1", question: "选哪个？", type: "multiple", options: ["甲", "乙"] }],
};

const setup = (interactive = true, tools: Array<{ name: string }> = []) => {
  const sent: PiSessionInteractionSnapshot[] = [];
  const send = vi.fn((snapshot: PiSessionInteractionSnapshot) => {
    sent.push(snapshot);
  });
  const interactions = new PiSessionInteractions({
    sessionId: "s1",
    interactive,
    tools: tools.map(tool => ({ ...tool, description: "", parameters: {} })),
    getMode: () => "manual",
    send,
  });
  return { interactions, questions: interactions.questions, sent, send };
};

describe("pi 宿主原生提问", () => {
  it("只注册给交互会话，渲染端已有同名工具时让位", () => {
    expect(
      setup()
        .interactions.hostTools()
        .map(tool => tool.name)
    ).toEqual(["ask-question"]);
    expect(setup(false).interactions.hostTools()).toEqual([]);
    expect(setup(true, [{ name: "ask-question" }]).interactions.hostTools()).toEqual([]);
  });

  it("作答后结束等待，快照版本递增且与审批共用", async () => {
    const { interactions, questions, sent } = setup();
    const asking = questions.ask("call-1", params);
    const [request] = interactions.snapshot().questions;
    expect(request).toMatchObject({ sessionId: "s1", toolCallId: "call-1" });
    expect(sent.at(-1)).toMatchObject({ revision: 1, approvals: [], questions: [request] });
    expect(
      questions.answer(request.requestId, [
        { questionId: "q1", selectedValues: ["甲", "乙", 3], otherText: "  补充  ", extra: true },
      ])
    ).toBeUndefined();
    const result = await asking;
    expect(JSON.parse((result.content[0] as { text: string }).text)).toMatchObject({
      answers: [
        {
          questionId: "q1",
          selectedOptions: [
            { value: "甲", label: "甲" },
            { value: "乙", label: "乙" },
          ],
          otherText: "补充",
        },
      ],
    });
    expect(sent.at(-1)).toMatchObject({ revision: 2, questions: [] });
    expect(questions.answer(request.requestId, [])).toBe("提问已结束，请刷新会话状态");
  });

  it("答案格式或必答不满足时拒收，等待保持", () => {
    const { interactions, questions } = setup();
    void questions.ask("call-1", params).catch(() => {});
    const [request] = interactions.snapshot().questions;
    expect(questions.answer(request.requestId, "不是数组")).toBe("答案格式不正确");
    expect(questions.answer(request.requestId, [{ selectedValues: [] }])).toBe("答案格式不正确");
    expect(questions.answer(request.requestId, [])).toBe("请先回答：选哪个？");
    expect(interactions.snapshot().questions).toHaveLength(1);
    interactions.dispose();
  });

  it("参数不合法直接报错给模型，不产生等待", async () => {
    const { interactions, questions, send } = setup();
    await expect(questions.ask("call-1", { questions: [] })).rejects.toThrow("非空 questions");
    expect(interactions.snapshot().questions).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it("中止、会话释放、通知失败都结束等待并报错", async () => {
    const aborted = setup();
    const controller = new AbortController();
    const waiting = aborted.questions.ask("call-1", params, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toThrow("提问已中止");
    expect(aborted.interactions.snapshot().questions).toEqual([]);
    const preAborted = new AbortController();
    preAborted.abort();
    await expect(aborted.questions.ask("call-2", params, preAborted.signal)).rejects.toThrow(
      "提问已中止"
    );

    const disposed = setup();
    const pending = disposed.questions.ask("call-1", params);
    disposed.interactions.dispose();
    await expect(pending).rejects.toThrow("会话已关闭");
    await expect(disposed.questions.ask("call-2", params)).rejects.toThrow("会话已关闭");

    const closed = setup();
    closed.send.mockImplementation(() => {
      throw new Error("窗口已销毁");
    });
    await expect(closed.questions.ask("call-1", params)).rejects.toThrow("提问界面不可用");
    expect(closed.interactions.snapshot().questions).toEqual([]);
  });
});
