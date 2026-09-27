/**
 * pi 会话宿主（主进程）与渲染端共享的桥类型：
 * 工具桥（ToolRegistry ↔ pi customTools）与会话创建参数中跨进程的字段。
 */
import type { RequestMessage } from "@/types";
import type { PiThinkingLevel } from "./pi-llm";
import type { ToolRisk } from "./tool";
import type { AskQuestionPayload } from "@/tools/askQuestionTypes";

/** 桌面工具清单项（渲染端 ToolRegistry 序列化）：JSON Schema 直通 pi */
export interface PiHostToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  risk?: ToolRisk;
  /** 内容编辑工具已自带确认应用卡，交互会话中不再重复审批。 */
  source?: string;
}

export type PiToolApprovalChoice = "allow" | "allow-session" | "deny";

export interface PiToolApprovalRequest {
  requestId: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  risk: ToolRisk;
  input: string;
  requestedAt: number;
}

/** 宿主原生 ask-question 的等待提问（问题载荷已由主进程归一化） */
export interface PiUserQuestionRequest {
  requestId: string;
  sessionId: string;
  toolCallId: string;
  payload: AskQuestionPayload;
  askedAt: number;
}

/**
 * 会话待用户处理的交互（工具审批 + 提问）快照，主进程按会话持有。
 * revision 在会话内递增，防止恢复查询覆盖较新的事件快照。
 */
export interface PiSessionInteractionSnapshot {
  sessionId: string;
  revision: number;
  approvals: PiToolApprovalRequest[];
  questions: PiUserQuestionRequest[];
}

/** 渲染端执行结果（toolRegistry ToolExecutionResult 的桥形状） */
export interface PiHostToolCallResult {
  content: string;
  /** 发给模型的文本（缺省用 content） */
  modelContent?: string;
  metadata?: Record<string, unknown>;
  isError?: boolean;
}

/** 主进程 pi-tool-call 事件载荷（工具桥：pi 调用 → 渲染端执行） */
export interface PiToolCallPayload {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
}

/** prompt 附带图片（渲染端只传定位信息，主进程读文件转 base64） */
export interface PiPromptImage {
  /** 本地文件绝对路径 */
  path?: string;
  /** dataURL（data:image/png;base64,xxx） */
  dataUrl?: string;
}

/** 会话创建参数（PiSessionCreateRequest 的渲染端形状） */
export interface PiSessionCreateRequestV2 {
  sessionId: string;
  scope: string;
  cwd: string;
  modelRef: { providerId: string; modelId: string };
  systemPrompt?: string;
  persist?: boolean;
  /** 打开已有会话（M4 resume）：目录表里的相对文件名；与 initialMessages 互斥 */
  sessionFile?: string;
  /** 新建时指定 pi 会话 id（= 目录表主键） */
  piSessionId?: string;
  shellPath?: string;
  /** 交 pi 注册的工具全集（含当前停用项），按名字排序 */
  customTools?: PiHostToolSpec[];
  /** 其中本轮活跃的桥接工具名；缺省时全部活跃 */
  activeToolNames?: string[];
  thinkingLevel?: PiThinkingLevel;
  /** 历史灌入（桌面 chat-core 消息；system/tool 消息由主进程转换器忽略） */
  initialMessages?: RequestMessage[];
  retryMaxRetries?: number;
  /**
   * 只有能展示审批条与提问卡的入口显式开启：宿主才注册 ask-question，工具需确认时才等待用户；
   * 其余入口需确认时直接拒绝。
   */
  interactive?: boolean;
}
