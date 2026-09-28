import type { AgentSession, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { PiHostToolSpec, PiSessionInteractionSnapshot } from "@/types/pi-session";
import type { ToolPermissionMode } from "@/services/tool-permission/mode";
import { ASK_QUESTION_TOOL_NAME } from "@/tools/askQuestionTypes";
import { PiToolPermissions } from "./pi-tool-permissions";
import { PiUserQuestions } from "./pi-user-questions";

/**
 * 会话待用户处理的交互（工具审批 + 提问）：两类等待共用一个会话内递增版本与一条通知通道，
 * 渲染端恢复时一次查询拿全，不会出现审批与提问快照交错覆盖。
 */
export class PiSessionInteractions {
  public readonly permissions: PiToolPermissions;
  public readonly questions: PiUserQuestions;
  private revision = 0;

  constructor(
    private readonly options: {
      sessionId: string;
      interactive: boolean;
      tools: PiHostToolSpec[];
      getMode: () => ToolPermissionMode;
      /** 发送快照到创建窗口；窗口已关闭时抛出，由等待方转为拒绝 */
      send: (snapshot: PiSessionInteractionSnapshot) => void;
    }
  ) {
    const onChange = () => this.publish();
    this.permissions = new PiToolPermissions({
      sessionId: options.sessionId,
      interactive: options.interactive,
      tools: options.tools,
      getMode: options.getMode,
      onChange,
    });
    this.questions = new PiUserQuestions({ sessionId: options.sessionId, onChange });
  }

  public snapshot(): PiSessionInteractionSnapshot {
    return {
      sessionId: this.options.sessionId,
      revision: this.revision,
      approvals: this.permissions.pendingRequests(),
      questions: this.questions.pendingRequests(),
    };
  }

  /** 宿主原生工具：只给交互会话提问能力；渲染端清单已有同名工具（外部 MCP）时让位 */
  public hostTools(): ToolDefinition[] {
    if (!this.options.interactive) return [];
    if (this.options.tools.some(tool => tool.name === ASK_QUESTION_TOOL_NAME)) return [];
    return [this.questions.toolDefinition()];
  }

  public install(session: AgentSession): void {
    this.permissions.install(session);
  }

  public dispose(): void {
    this.permissions.dispose();
    this.questions.dispose();
  }

  private publish(): void {
    this.revision += 1;
    this.options.send(this.snapshot());
  }
}
