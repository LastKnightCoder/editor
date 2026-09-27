import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  answerQuestion,
  decideToolApproval,
  receiveInteractions,
  refreshInteractions,
  usePiInteractionStore,
} from "../piInteractions";
import {
  piSessionAnswerQuestion,
  piSessionApproveTool,
  piSessionInteractions,
} from "@/commands/piSession";
import type {
  PiSessionInteractionSnapshot,
  PiToolApprovalRequest,
  PiUserQuestionRequest,
} from "@/types/pi-session";

vi.mock("@/commands/piSession", () => ({
  onPiSessionInteractions: vi.fn(),
  piSessionInteractions: vi.fn(),
  piSessionApproveTool: vi.fn(),
  piSessionAnswerQuestion: vi.fn(),
}));

const request = (id: string, sessionId = "session-1"): PiToolApprovalRequest => ({
  requestId: `${sessionId}/${id}`,
  sessionId,
  toolCallId: id,
  toolName: "run_skill_script",
  risk: "execute",
  input: "{}",
  requestedAt: 1,
});

const question = (id: string, sessionId = "session-1"): PiUserQuestionRequest => ({
  requestId: `${sessionId}/q-${id}`,
  sessionId,
  toolCallId: id,
  payload: {
    questions: [{ id: "q1", question: "选哪个？", type: "single", required: true, options: [] }],
  },
  askedAt: 1,
});

const snapshot = (
  sessionId: string,
  revision: number,
  parts: Partial<Pick<PiSessionInteractionSnapshot, "approvals" | "questions">> = {}
): PiSessionInteractionSnapshot => ({
  sessionId,
  revision,
  approvals: parts.approvals ?? [],
  questions: parts.questions ?? [],
});

describe("pi 会话交互投影", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePiInteractionStore.setState({ sessions: {}, readySessions: {} });
  });

  it("不同会话的同名工具调用不串台", () => {
    for (const sessionId of ["session-1", "session-2"]) {
      receiveInteractions(
        snapshot(sessionId, 1, {
          approvals: [request("call-1", sessionId)],
          questions: [question("call-2", sessionId)],
        })
      );
    }
    receiveInteractions(snapshot("session-1", 2));
    const { sessions } = usePiInteractionStore.getState();
    expect(sessions["session-1"].approvals).toEqual([]);
    expect(sessions["session-1"].questions).toEqual([]);
    expect(sessions["session-2"].approvals).toHaveLength(1);
    expect(sessions["session-2"].questions).toHaveLength(1);
  });

  it("重载恢复查询晚于事件返回时不复活旧等待", async () => {
    vi.mocked(piSessionInteractions).mockResolvedValue({
      ok: true,
      snapshots: [
        snapshot("session-1", 1, { approvals: [request("a")], questions: [question("b")] }),
      ],
    });
    const refreshing = refreshInteractions();
    receiveInteractions(snapshot("session-1", 2));
    await refreshing;
    expect(usePiInteractionStore.getState().sessions["session-1"]).toMatchObject({
      approvals: [],
      questions: [],
    });
  });

  it.each(["allow", "allow-session", "deny"] as const)(
    "%s 只向宿主提交，不乐观伪造授权",
    async choice => {
      const item = request("a");
      receiveInteractions(snapshot(item.sessionId, 1, { approvals: [item] }));
      vi.mocked(piSessionApproveTool).mockResolvedValue({ ok: true });
      await decideToolApproval(item, choice);
      expect(piSessionApproveTool).toHaveBeenCalledWith(item.sessionId, item.requestId, choice);
      expect(usePiInteractionStore.getState().sessions[item.sessionId].approvals).toEqual([item]);
    }
  );

  it("过期审批返回可见错误，并同步主进程最新状态", async () => {
    vi.mocked(piSessionApproveTool).mockResolvedValue({ ok: false, error: "审批已结束" });
    vi.mocked(piSessionInteractions).mockResolvedValue({
      ok: true,
      snapshots: [snapshot("session-1", 2)],
    });
    await expect(decideToolApproval(request("a"), "allow")).rejects.toThrow("审批已结束");
    expect(usePiInteractionStore.getState().sessions["session-1"].approvals).toEqual([]);
  });

  it("答案只向宿主提交；宿主拒收时报错并同步最新状态", async () => {
    const item = question("a");
    const answers = [{ questionId: "q1", selectedValues: ["x"], otherText: "" }];
    receiveInteractions(snapshot(item.sessionId, 1, { questions: [item] }));
    vi.mocked(piSessionAnswerQuestion).mockResolvedValueOnce({ ok: true });
    await answerQuestion(item, answers);
    expect(piSessionAnswerQuestion).toHaveBeenCalledWith(item.sessionId, item.requestId, answers);
    expect(usePiInteractionStore.getState().sessions[item.sessionId].questions).toEqual([item]);

    vi.mocked(piSessionAnswerQuestion).mockResolvedValueOnce({ ok: false, error: "提问已结束" });
    vi.mocked(piSessionInteractions).mockResolvedValue({
      ok: true,
      snapshots: [snapshot("session-1", 2)],
    });
    await expect(answerQuestion(item, answers)).rejects.toThrow("提问已结束");
    expect(usePiInteractionStore.getState().sessions["session-1"].questions).toEqual([]);
  });
});
