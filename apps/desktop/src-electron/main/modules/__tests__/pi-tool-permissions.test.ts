import { describe, expect, it, vi } from "vitest";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { PiHostToolSpec } from "@/types/pi-session";
import type { ToolPermissionMode } from "@/services/tool-permission/mode";
import { PiToolPermissions } from "../pi-tool-permissions";

const context = (name: string, id = "call-1") =>
  ({
    toolCall: { id, name, arguments: {} },
    args: { path: "示例.md" },
  }) as Parameters<PiToolPermissions["authorize"]>[0];
const setup = (
  mode: ToolPermissionMode = "manual",
  interactive = true,
  tools: PiHostToolSpec[] = []
) => {
  const publish = vi.fn();
  const state = { mode };
  const permissions = new PiToolPermissions({
    sessionId: "s1",
    interactive,
    tools,
    publish,
    getMode: () => state.mode,
  });
  return { permissions, state, publish };
};

describe("pi 宿主工具权限", () => {
  it.each(["read", "grep", "find", "ls"])("手动模式下 %s 直接执行", async name => {
    const { permissions } = setup();
    await expect(permissions.authorize(context(name))).resolves.toBeUndefined();
    expect(permissions.snapshot().pending).toEqual([]);
  });

  it.each(["write", "edit", "bash", "powershell"])(
    "手动模式下 %s 挂起，拒绝后不授权",
    async name => {
      const { permissions } = setup();
      const result = permissions.authorize(context(name));
      const [request] = permissions.snapshot().pending;
      expect(request).toMatchObject({ toolName: name, toolCallId: "call-1", sessionId: "s1" });
      expect(permissions.decide(request.requestId, "deny")).toBe(true);
      await expect(result).resolves.toMatchObject({ block: true, reason: "用户拒绝执行此工具" });
      expect(permissions.snapshot().pending).toEqual([]);
      expect(permissions.decide(request.requestId, "allow")).toBe(false);
    }
  );

  it("自动编辑允许 write，仍拦截 shell；bypass 释放等待", async () => {
    const { permissions, state } = setup("acceptEdits");
    await expect(permissions.authorize(context("write"))).resolves.toBeUndefined();
    const waiting = permissions.authorize(context("bash"));
    expect(permissions.snapshot().pending).toHaveLength(1);
    state.mode = "bypass";
    permissions.modeChanged();
    await expect(waiting).resolves.toBeUndefined();
    await expect(permissions.authorize(context("powershell"))).resolves.toBeUndefined();
  });

  it("同会话同工具授权不扩散到其它工具或其它会话", async () => {
    const { permissions } = setup();
    const first = permissions.authorize(context("bash"));
    permissions.decide(permissions.snapshot().pending[0].requestId, "allow-session");
    await first;
    await expect(permissions.authorize(context("bash", "call-2"))).resolves.toBeUndefined();
    const otherTool = permissions.authorize(context("write"));
    expect(permissions.snapshot().pending).toHaveLength(1);
    const otherSession = setup().permissions;
    const another = otherSession.authorize(context("bash"));
    expect(otherSession.snapshot().pending).toHaveLength(1);
    permissions.dispose();
    otherSession.dispose();
    await Promise.all([otherTool, another]);
  });

  it("取消等待会清理请求，迟到的允许不能授权后续调用", async () => {
    const { permissions } = setup();
    const controller = new AbortController();
    const waiting = permissions.authorize(context("bash"), controller.signal);
    const requestId = permissions.snapshot().pending[0].requestId;
    controller.abort();
    await expect(waiting).resolves.toMatchObject({ block: true });
    expect(permissions.snapshot().pending).toEqual([]);
    expect(permissions.decide(requestId, "allow-session")).toBe(false);
    const next = permissions.authorize(context("bash"));
    expect(permissions.snapshot().pending[0].requestId).not.toBe(requestId);
    permissions.dispose();
    await next;
    await expect(permissions.authorize(context("read"))).resolves.toMatchObject({ block: true });
  });

  it("通知通道失效时拒绝执行且不遗留等待", async () => {
    const { permissions, publish } = setup();
    publish.mockImplementation(() => {
      throw new Error("窗口已销毁");
    });
    await expect(permissions.authorize(context("write"))).resolves.toMatchObject({ block: true });
    expect(permissions.snapshot().pending).toEqual([]);
  });

  it("一次性入口需要确认时直接拒绝；无声明的额外工具保守处理", async () => {
    const { permissions } = setup("manual", false);
    await expect(permissions.authorize(context("write"))).resolves.toMatchObject({ block: true });
    await expect(permissions.authorize(context("unknown"))).resolves.toMatchObject({ block: true });
    expect(permissions.snapshot().pending).toEqual([]);
  });

  it("MCP 风险按清单处理，只有交互入口豁免自带内容审阅卡", async () => {
    const tools: PiHostToolSpec[] = [
      { name: "mcp-write", risk: "write", description: "", parameters: {} },
      {
        name: "review",
        risk: "write",
        source: "content-edit-tools",
        description: "",
        parameters: {},
      },
    ];
    const { permissions } = setup("manual", true, tools);
    const waiting = permissions.authorize(context("mcp-write"));
    expect(permissions.snapshot().pending[0].risk).toBe("write");
    await expect(permissions.authorize(context("review"))).resolves.toBeUndefined();
    const nonInteractive = setup("manual", false, tools).permissions;
    await expect(nonInteractive.authorize(context("review"))).resolves.toMatchObject({
      block: true,
    });
    permissions.dispose();
    await waiting;
  });

  it("保留 pi 扩展的拒绝决定并审批扩展修改后的参数", async () => {
    const { permissions } = setup();
    const previous = vi
      .fn()
      .mockResolvedValueOnce({ block: true, reason: "扩展拒绝" })
      .mockImplementationOnce(async call => {
        call.args = { command: "扩展后的命令" };
      });
    const session = { agent: { beforeToolCall: previous } } as unknown as AgentSession;
    permissions.install(session);
    await expect(session.agent.beforeToolCall!(context("bash"))).resolves.toMatchObject({
      block: true,
    });
    expect(permissions.snapshot().pending).toEqual([]);
    const waiting = session.agent.beforeToolCall!(context("bash"));
    await vi.waitFor(() => expect(permissions.snapshot().pending).toHaveLength(1));
    expect(permissions.snapshot().pending[0].input).toContain("扩展后的命令");
    permissions.dispose();
    await waiting;
  });
});
