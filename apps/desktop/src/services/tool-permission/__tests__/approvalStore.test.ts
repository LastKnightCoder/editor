import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decideToolApproval,
  receiveToolApprovals,
  refreshToolApprovals,
  useToolApprovalStore,
} from "../approvalStore";
import { piSessionApprovals, piSessionApproveTool } from "@/commands/piSession";
import type { PiToolApprovalRequest } from "@/types/pi-session";

vi.mock("@/commands/piSession", () => ({
  onPiToolApprovals: vi.fn(),
  piSessionApprovals: vi.fn(),
  piSessionApproveTool: vi.fn(),
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

describe("pi 工具审批投影", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToolApprovalStore.setState({ sessions: {}, readySessions: {} });
  });

  it("不同会话的同名工具调用不串台", () => {
    for (const sessionId of ["session-1", "session-2"]) {
      receiveToolApprovals({ sessionId, revision: 1, pending: [request("call-1", sessionId)] });
    }
    receiveToolApprovals({ sessionId: "session-1", revision: 2, pending: [] });
    expect(useToolApprovalStore.getState().sessions["session-1"].pending).toEqual([]);
    expect(useToolApprovalStore.getState().sessions["session-2"].pending).toHaveLength(1);
  });

  it("重载恢复查询晚于事件返回时不复活旧审批", async () => {
    vi.mocked(piSessionApprovals).mockResolvedValue({
      ok: true,
      snapshots: [{ sessionId: "session-1", revision: 1, pending: [request("a")] }],
    });
    const refreshing = refreshToolApprovals();
    receiveToolApprovals({ sessionId: "session-1", revision: 2, pending: [] });
    await refreshing;
    expect(useToolApprovalStore.getState().sessions["session-1"].pending).toEqual([]);
  });

  it.each(["allow", "allow-session", "deny"] as const)(
    "%s 只向宿主提交，不乐观伪造授权",
    async choice => {
      const item = request("a");
      receiveToolApprovals({ sessionId: item.sessionId, revision: 1, pending: [item] });
      vi.mocked(piSessionApproveTool).mockResolvedValue({ ok: true });
      await decideToolApproval(item, choice);
      expect(piSessionApproveTool).toHaveBeenCalledWith(item.sessionId, item.requestId, choice);
      expect(useToolApprovalStore.getState().sessions[item.sessionId].pending).toEqual([item]);
    }
  );

  it("过期审批返回可见错误，并同步主进程最新状态", async () => {
    vi.mocked(piSessionApproveTool).mockResolvedValue({ ok: false, error: "审批已结束" });
    vi.mocked(piSessionApprovals).mockResolvedValue({
      ok: true,
      snapshots: [{ sessionId: "session-1", revision: 2, pending: [] }],
    });
    await expect(decideToolApproval(request("a"), "allow")).rejects.toThrow("审批已结束");
    expect(useToolApprovalStore.getState().sessions["session-1"].pending).toEqual([]);
  });
});
