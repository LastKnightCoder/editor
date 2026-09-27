import { randomUUID } from "node:crypto";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type {
  PiHostToolSpec,
  PiToolApprovalChoice,
  PiToolApprovalRequest,
  PiToolApprovalSnapshot,
} from "@/types/pi-session";
import type { ToolRisk } from "@/types/tool";
import { requiresApproval, type ToolPermissionMode } from "@/services/tool-permission/mode";

type ToolHook = NonNullable<AgentSession["agent"]["beforeToolCall"]>;
type ToolDecision = Awaited<ReturnType<ToolHook>>;

const BUILTIN_RISKS: Record<string, ToolRisk> = {
  read: "read",
  grep: "read",
  find: "read",
  ls: "read",
  edit: "write",
  write: "write",
  bash: "execute",
  powershell: "execute",
};

/** 等待与授权归会话宿主所有；页面切换、渲染层重载都不改变授权事实。 */
export class PiToolPermissions {
  private readonly allowed = new Set<string>();
  private readonly pending = new Map<
    string,
    {
      request: PiToolApprovalRequest;
      settle: (decision: ToolDecision) => void;
    }
  >();
  private revision = 0;
  private disposed = false;

  constructor(
    private readonly options: {
      sessionId: string;
      interactive: boolean;
      tools: PiHostToolSpec[];
      getMode: () => ToolPermissionMode;
      publish: (snapshot: PiToolApprovalSnapshot) => void;
    }
  ) {}

  public snapshot(): PiToolApprovalSnapshot {
    return {
      sessionId: this.options.sessionId,
      revision: this.revision,
      pending: [...this.pending.values()].map(item => item.request),
    };
  }

  /** 保留 pi 已安装的扩展钩子；宿主审批最后执行，覆盖扩展修改后的最终参数。 */
  public install(session: AgentSession): void {
    const previous = session.agent.beforeToolCall;
    session.agent.beforeToolCall = async (context, signal) => {
      const result = await previous?.(context, signal);
      if (result?.block) return result;
      return this.authorize(context, signal);
    };
  }

  public readonly authorize: ToolHook = async ({ toolCall, args }, signal) => {
    if (this.disposed || signal?.aborted) return { block: true, reason: "工具执行已中止" };
    const spec = this.options.tools.find(tool => tool.name === toolCall.name);
    const risk = spec ? (spec.risk ?? "execute") : (BUILTIN_RISKS[toolCall.name] ?? "execute");
    if (
      !requiresApproval(risk, this.options.getMode()) ||
      this.allowed.has(toolCall.name) ||
      (this.options.interactive && spec?.source === "content-edit-tools")
    )
      return undefined;
    if (!this.options.interactive) {
      return {
        block: true,
        reason: "当前入口无法向用户确认，工具未执行；请在交互对话中操作或调整工具权限设置",
      };
    }
    const request: PiToolApprovalRequest = {
      requestId: randomUUID(),
      sessionId: this.options.sessionId,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      risk,
      input: JSON.stringify(args ?? {}),
      requestedAt: Date.now(),
    };
    return new Promise<ToolDecision>(resolve => {
      const settle = (decision: ToolDecision) => {
        if (!this.pending.delete(request.requestId)) return;
        signal?.removeEventListener("abort", onAbort);
        try {
          this.publish();
        } catch {
          // 窗口关闭后仍须结束等待，不能让通知失败阻塞会话收尾。
        } finally {
          resolve(decision);
        }
      };
      const onAbort = () => settle({ block: true, reason: "工具执行已中止" });
      this.pending.set(request.requestId, { request, settle });
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        this.publish();
      } catch {
        settle({ block: true, reason: "审批界面不可用，工具未执行" });
      }
    });
  };

  public decide(requestId: string, choice: PiToolApprovalChoice): boolean {
    const item = this.pending.get(requestId);
    if (!item || !["allow", "allow-session", "deny"].includes(choice)) return false;
    if (choice === "allow-session") this.allowed.add(item.request.toolName);
    item.settle(choice === "deny" ? { block: true, reason: "用户拒绝执行此工具" } : undefined);
    if (choice === "allow-session") {
      for (const pending of this.pending.values()) {
        if (pending.request.toolName === item.request.toolName) pending.settle(undefined);
      }
    }
    return true;
  }

  public modeChanged(): void {
    for (const item of this.pending.values()) {
      if (!requiresApproval(item.request.risk, this.options.getMode())) item.settle(undefined);
    }
  }

  public dispose(): void {
    this.disposed = true;
    for (const item of this.pending.values()) {
      item.settle({ block: true, reason: "会话已关闭，工具未执行" });
    }
    this.allowed.clear();
  }

  private publish(): void {
    this.revision += 1;
    this.options.publish(this.snapshot());
  }
}
