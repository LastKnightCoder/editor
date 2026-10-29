import type { Message } from "@earendil-works/pi-ai";
import { AiError } from "../contracts";
import { getSessionBranch } from "./tree";
import {
  isRecord,
  type PiTranscriptMessage,
  type SessionContext,
  type SessionDocument,
  type SessionEntry,
} from "./types";

const stateEntries = new Set([
  "custom",
  "context_edit",
  "thinking_level_change",
  "model_change",
  "usage",
  "label",
  "session_info",
]);
const contextRoles = new Set([
  "system",
  "user",
  "assistant",
  "toolResult",
  "custom",
  "bashExecution",
  "branchSummary",
  "compactionSummary",
]);

function messagesOf(entry: SessionEntry): PiTranscriptMessage[] {
  if (entry.type === "message" && entry.message) {
    const message = entry.message;
    if (!contextRoles.has(message.role ?? ""))
      throw new AiError(
        "AI_SESSION_FORMAT_UNSUPPORTED",
        "未知消息角色不能安全恢复模型上下文",
        false,
        { role: message.role }
      );
    if (
      message.content == null &&
      ["system", "user", "assistant", "toolResult"].includes(message.role ?? "")
    )
      return [{ ...message, content: message.role === "system" ? "" : [] }];
    return [message];
  }
  const timestamp = Date.parse(entry.timestamp);
  if (entry.type === "custom_message")
    return [
      {
        role: "custom",
        customType: entry.customType,
        content: entry.content ?? [],
        display: entry.display,
        details: entry.details,
        timestamp,
      },
    ];
  if (entry.type === "branch_summary")
    return entry.summary
      ? [{ role: "branchSummary", summary: entry.summary, fromId: entry.fromId, timestamp }]
      : [];
  if (entry.type === "compaction") {
    const summary: PiTranscriptMessage = {
      role: "compactionSummary",
      summary: entry.summary,
      tokensBefore: entry.tokensBefore,
      timestamp,
    };
    return isRecord(entry.systemMessage)
      ? [entry.systemMessage as PiTranscriptMessage, summary]
      : [summary];
  }
  if (!stateEntries.has(entry.type))
    throw new AiError(
      "AI_SESSION_FORMAT_UNSUPPORTED",
      "未知会话记录不能安全恢复模型上下文",
      false,
      { type: entry.type }
    );
  return [];
}

export function buildSessionContext(
  document: SessionDocument,
  leafId?: string | null
): SessionContext {
  if (document.diagnostics.length)
    throw new AiError("AI_SESSION_INVALID", "会话末尾存在未完成记录，不能恢复执行");
  const path = getSessionBranch(document, leafId);
  let thinkingLevel = "off";
  let model: SessionContext["model"] = null;
  for (const entry of path) {
    if (entry.type === "thinking_level_change") thinkingLevel = String(entry.thinkingLevel);
    else if (entry.type === "model_change")
      model = { provider: String(entry.provider), modelId: String(entry.modelId) };
    else if (entry.type === "message" && entry.message?.role === "assistant")
      model = {
        provider: entry.message.provider as string,
        modelId: entry.message.model as string,
      };
  }
  let compactionIndex = -1;
  for (let index = path.length - 1; index >= 0; index--)
    if (path[index].type === "compaction") {
      compactionIndex = index;
      break;
    }
  let contextEntries = path;
  if (compactionIndex >= 0) {
    const compaction = path[compactionIndex];
    const keptIndex = path.findIndex(entry => entry.id === compaction.firstKeptEntryId);
    const kept =
      keptIndex >= 0 && keptIndex < compactionIndex
        ? path
            .slice(keptIndex, compactionIndex)
            .filter(entry => entry.type !== "message" || entry.message?.role !== "system")
        : [];
    contextEntries = [compaction, ...kept, ...path.slice(compactionIndex + 1)];
  }
  const edits = new Map(
    contextEntries
      .filter(entry => entry.type === "context_edit")
      .map(entry => [String(entry.targetId), entry.replacement])
  );
  const messages = contextEntries.flatMap((entry, index) => {
    if (entry.type === "compaction" && index > 0) return [];
    const messages = messagesOf(entry);
    const replacement = edits.get(entry.id);
    if (replacement === null) return [];
    if (!isRecord(replacement)) return messages;
    return messages.map(message => {
      if (!["user", "assistant", "toolResult", "custom"].includes(message.role ?? ""))
        return message;
      const content =
        (message.role === "assistant" || message.role === "toolResult") &&
        typeof replacement.content === "string"
          ? [{ type: "text", text: replacement.content }]
          : replacement.content;
      return { ...message, content };
    });
  });
  return structuredClone({ messages, thinkingLevel, model });
}

/** 将 pi 的摘要/自定义上下文转成模型能消费的标准角色，原始历史不被改写。 */
export function convertSessionMessagesToLlm(messages: readonly PiTranscriptMessage[]): Message[] {
  return messages.flatMap(message => {
    const timestamp = message.timestamp ?? 0;
    if (["system", "user", "assistant", "toolResult"].includes(message.role ?? ""))
      return [message as unknown as Message];
    let content: unknown;
    if (message.role === "custom")
      content =
        typeof message.content === "string"
          ? [{ type: "text", text: message.content }]
          : message.content;
    else if (message.role === "compactionSummary")
      content = [
        {
          type: "text",
          text: `The conversation history before this point was compacted into the following summary:\n\n<summary>\n${message.summary}\n</summary>`,
        },
      ];
    else if (message.role === "branchSummary")
      content = [
        {
          type: "text",
          text: `The following is a summary of a branch that this conversation came back from:\n\n<summary>\n${message.summary}</summary>`,
        },
      ];
    else if (message.role === "bashExecution") {
      if (message.excludeFromContext) return [];
      let text =
        `Ran \`${message.command}\`\n` +
        (message.output ? `\`\`\`\n${message.output}\n\`\`\`` : "(no output)");
      if (message.cancelled) text += "\n\n(command cancelled)";
      else if (
        message.exitCode !== null &&
        message.exitCode !== undefined &&
        message.exitCode !== 0
      )
        text += `\n\nCommand exited with code ${message.exitCode}`;
      if (message.truncated && message.fullOutputPath)
        text += `\n\n[Output truncated. Full output: ${message.fullOutputPath}]`;
      content = [{ type: "text", text }];
    } else throw new AiError("AI_SESSION_FORMAT_UNSUPPORTED", "未知消息角色不能转换为模型输入");
    return [{ role: "user", content, timestamp } as Message];
  });
}
