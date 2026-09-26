import { beforeEach, describe, expect, it } from "vitest";
import {
  decideToolApproval,
  hasLiveApproval,
  isSessionAllowed,
  requestToolApproval,
  useToolApprovalStore,
} from "../approvalStore";

const request = (id: string, conversationKey = "chat:1") => ({
  toolCallId: id,
  toolName: "run_skill_script",
  risk: "execute" as const,
  input: "{}",
  conversationKey,
});

describe("工具确认队列", () => {
  beforeEach(() => useToolApprovalStore.setState({ pending: {}, sessionAllowed: {} }));

  it("允许 / 拒绝回填决定并清掉等待项", async () => {
    const allowed = requestToolApproval(request("a"));
    expect(hasLiveApproval("a")).toBe(true);
    decideToolApproval("a", "allow");
    await expect(allowed).resolves.toEqual({ approved: true });
    expect(useToolApprovalStore.getState().pending.a).toBeUndefined();

    const denied = requestToolApproval(request("b"));
    decideToolApproval("b", "deny", "不要");
    await expect(denied).resolves.toEqual({ approved: false, reason: "不要" });
  });

  it("本会话始终允许只作用于同一会话的同一工具", async () => {
    const p = requestToolApproval(request("c"));
    decideToolApproval("c", "allow-session");
    await p;
    expect(isSessionAllowed("chat:1", "run_skill_script")).toBe(true);
    expect(isSessionAllowed("chat:2", "run_skill_script")).toBe(false);
    expect(isSessionAllowed("chat:1", "other_tool")).toBe(false);
  });

  it("中止时以 AbortError 拒绝", async () => {
    const controller = new AbortController();
    const p = requestToolApproval(request("d"), controller.signal);
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(hasLiveApproval("d")).toBe(false);
  });
});
