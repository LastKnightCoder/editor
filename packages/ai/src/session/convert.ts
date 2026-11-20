/**
 * pi SDK 权威类型（AgentMessage / SDK SessionEntry）与本包视图类型（PiTranscriptMessage /
 * SessionEntry）之间的命名转换边界。两侧类型在运行时同构、仅被 TS 接口索引签名规则阻隔；
 * 转换是类型层视角切换，值不重建，序列化输出与转换前一致。跨侧传递只允许经过本文件的函数。
 */
import type { AgentMessage } from "@earendil-works/pi-agent-core";
// 声明合并依赖：pi-coding-agent 对 CustomAgentMessages 的全局合并让 AgentMessage 联合含
// custom / bashExecution / branchSummary / compactionSummary 四个角色，不引入本模块时这些
// 分支在本包编译单元不可见。纯类型导入，不进入运行时产物（check-browser 有断言）。
import type { SessionEntry as SdkSessionEntry } from "@earendil-works/pi-coding-agent";
import { AiError } from "../contracts";
import type { PiTranscriptMessage, SessionEntry } from "./types";

/**
 * SDK AgentMessage → 本包消息视图（D→C，安全方向：SDK 消息结构上满足视图）。
 * 零拷贝返回原对象——投影与上下文构建经索引签名读取任意字段，白名单拷贝会丢字段。
 */
export function transcriptFromAgentMessage(message: AgentMessage): PiTranscriptMessage {
  return message as PiTranscriptMessage;
}

type FieldCheck = [key: string, valid: (value: unknown) => boolean];

const isString = (value: unknown): value is string => typeof value === "string";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isNumber = (value: unknown): value is number => typeof value === "number";
const isRecordValue = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isContent = (value: unknown): boolean =>
  isString(value) || (Array.isArray(value) && value.every(isRecordValue));

// 各角色的 SDK 必填字段（顶层）。usage 只校验对象存在：官方差分夹具与 SDK 运行时都
// 接受缺 cost/totalTokens 的历史 usage，逐字段收紧会拒掉官方能读的文件。
const requiredFieldsByRole = new Map<string, FieldCheck[]>([
  [
    "system",
    [
      ["content", isContent],
      ["timestamp", isNumber],
    ],
  ],
  [
    "user",
    [
      ["content", isContent],
      ["timestamp", isNumber],
    ],
  ],
  [
    "assistant",
    [
      ["content", isContent],
      ["api", isString],
      ["provider", isString],
      ["model", isString],
      ["usage", isRecordValue],
      ["stopReason", isString],
      ["timestamp", isNumber],
    ],
  ],
  [
    "toolResult",
    [
      ["toolCallId", isString],
      ["toolName", isString],
      ["content", isContent],
      ["isError", isBoolean],
      ["timestamp", isNumber],
    ],
  ],
  [
    "custom",
    [
      ["customType", isString],
      ["content", isContent],
      ["display", isBoolean],
      ["timestamp", isNumber],
    ],
  ],
  [
    "bashExecution",
    [
      ["command", isString],
      ["output", isString],
      ["cancelled", isBoolean],
      ["truncated", isBoolean],
      ["timestamp", isNumber],
    ],
  ],
  [
    "branchSummary",
    [
      ["summary", isString],
      ["fromId", value => isString(value) || value === null],
      ["timestamp", isNumber],
    ],
  ],
  [
    "compactionSummary",
    [
      ["summary", isString],
      ["tokensBefore", isNumber],
      ["timestamp", isNumber],
    ],
  ],
]);

/**
 * 本包消息视图 → SDK AgentMessage（C→D，不安全方向：视图是开放接口，SDK 联合有必填字段）。
 * 按 role 校验必填字段后原样返回（零拷贝）；缺失即抛 AI_SESSION_FORMAT_UNSUPPORTED——
 * 拒绝比误造安全，让"SDK 能读、@tau/ai 报错"的差异在恢复边界显式暴露而不是进模型上下文后漂移。
 */
export function agentMessageFromTranscript(message: PiTranscriptMessage): AgentMessage {
  const role = message.role;
  const checks = role === undefined ? undefined : requiredFieldsByRole.get(role);
  if (!checks)
    throw new AiError("AI_SESSION_FORMAT_UNSUPPORTED", "未知消息角色不能恢复为 SDK 消息", false, {
      role,
    });
  const missing = checks.filter(([key, valid]) => !valid(message[key])).map(([key]) => key);
  if (missing.length)
    throw new AiError(
      "AI_SESSION_FORMAT_UNSUPPORTED",
      "历史消息缺少 SDK 必填字段，不能恢复为模型上下文",
      false,
      { role, missing }
    );
  return message as AgentMessage;
}

/**
 * SDK SessionManager 读出的 entry 列表 → 本包会话文档 entry（A→B）。
 * 桌面全部 SDK 读取路径（投影、树导航）的统一入口：message 载荷显式转成视图，
 * 其余 entry 结构字段与 SDK 同名同型，零拷贝切换视角（消费端只读）。
 */
export function documentEntriesFromSdk(entries: readonly SdkSessionEntry[]): SessionEntry[] {
  return entries.map(entry =>
    entry.type === "message"
      ? { ...entry, message: transcriptFromAgentMessage(entry.message) }
      : (entry as SessionEntry)
  );
}
