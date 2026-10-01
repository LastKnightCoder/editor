/**
 * pi 会话宿主（主进程）与渲染端共享的桥类型：
 * 工具桥（ToolRegistry ↔ pi customTools）与会话创建参数中跨进程的字段。
 */
import type { MessageContent, RequestMessage } from "@/types";
import type { PiThinkingLevel } from "./pi-llm";
import type { UsageSource } from "./model-usage";
import type { ToolRisk } from "./tool";
import type { AskQuestionPayload } from "@/tools/askQuestionTypes";

/** 桌面工具清单项（渲染端 ToolRegistry 序列化）：JSON Schema 直通 pi */
export interface PiHostToolSpec {
  executionIdentity?: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  risk?: ToolRisk;
  /** 内容编辑工具已自带确认应用卡，交互会话中不再重复审批。 */
  source?: string;
}

export const piToolDefinitionKey = (tool: PiHostToolSpec): string =>
  JSON.stringify([
    tool.name,
    tool.description,
    tool.parameters,
    tool.risk ?? "execute",
    tool.source ?? "",
    tool.executionIdentity ?? "",
  ]);

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
  executionId?: string;
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

/**
 * 用户消息的桌面展示形态（M4）：prompt/steer 时一并交给主进程，写成会话文件里的展示 entry
 * （文件卡片、mention、skills、图片编辑前的原话）。模型文本由主进程取实际送给 pi 的文本，
 * 渲染端不传，两边不可能对不上。
 */
export interface PiPromptDisplay {
  content: MessageContent[];
  clientId?: string;
}

/** 失败重试定位；尚未落盘时使用原用户消息的 clientId。 */
export interface PiPromptRetry {
  entryId?: string;
  clientId?: string;
}

/**
 * 会话文件的位置（M4）：应用对话按当前库会话目录下的文件名；浏览器扩展对话按页面 + 会话 id
 * （目录由主进程按页面哈希算出，文件按 id 查找，外部输入不拼进路径）。
 */
export type PiSessionLocation =
  { sessionFile: string; databaseName?: string } | { pageUrl: string; sessionId: string };

/**
 * 树谱视图的一个节点（M4-d）：一条用户消息，回答折叠进去。父 = 上一条用户消息（根上为 null），
 * 同一父下的多个节点就是分叉。主进程 conversationTreeOf 产出。
 */
export interface ConversationTreeNode {
  id: string;
  parentId: string | null;
  text: string;
  answered: boolean;
  /** 最后活动时间（毫秒） */
  time: number;
  onPath: boolean;
  omitted: boolean;
}

/** 浏览器扩展的一个对话（直接取自 pi 会话文件，无目录表） */
export interface PiBrowserSessionInfo {
  id: string;
  /** pi session name；没起名时为首条用户消息 */
  title: string;
  createTime: number;
  updateTime: number;
  messageCount: number;
}

/** 会话创建参数（PiSessionCreateRequest 的渲染端形状） */
export interface PiSessionCreateRequestV2 {
  toolScope?: string;
  databaseName?: string;
  sessionId: string;
  scope: string;
  /** 聊天场景（带所属对象，如 `vibe-learning-chat:12`）；学习项目对话据此固定工作目录 */
  chatScope?: string;
  cwd: string;
  modelRef: { providerId: string; modelId: string };
  systemPrompt?: string;
  persist?: boolean;
  /** 打开已有会话（M4 resume）：目录表里的相对文件名；与 initialMessages 互斥 */
  sessionFile?: string;
  /** 新建时指定 pi 会话 id（= 目录表主键） */
  piSessionId?: string;
  /**
   * 浏览器扩展对话（M4.5）：会话落在 `browser-sessions/<页面键>/`，按 piSessionId 找文件 resume。
   * 与 sessionFile 互斥。
   */
  browserPageUrl?: string;
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
  /** 用量审计归属；缺省时主进程按 scope 推导功能 */
  source?: UsageSource;
}

/** 对话工作目录的状态（pi-session:workspace-info） */
export interface PiWorkspaceInfo {
  /** 实际使用的目录（请求为空或不存在时为应用数据目录） */
  path: string;
  /** 是否落到了应用数据目录（未设置，或设置的目录不存在） */
  isAppDir: boolean;
  /** 请求的目录不存在、已退回应用数据目录 */
  missing: boolean;
  /** 不是 git 仓库（或本机没装 git）时为 null */
  git: PiWorkspaceGit | null;
}

export interface PiWorkspaceGit {
  /** 仓库根目录 */
  root: string;
  /** 当前分支；游离 HEAD 时为 null */
  branch: string | null;
  /** HEAD 短哈希（游离时展示用） */
  head: string;
}
