/**
 * Agent 在原文上向用户提问（方案 B 的反问）：锚在一段原句上，给几个可点的选项，
 * 等用户在正文批注或对话卡片里作答。拿不准改法时先问，不用「提改动 → 被退回 → 重来」去试探。
 */

import { bindDatabaseCommands } from "@/services/command-context";
import { createContentQuestion } from "@/commands/content";
import { agentIdentity } from "@/services/agent-identity";
import { reportAgentPresence } from "@/services/agent-presence";
import type { ToolExecutionContext } from "@/types";
import { applyEditOperations } from "./edit-engine";
import { findContentRanges } from "./matcher";
import { loadSnapshotForContent, resolveContentTarget } from "./resolver";
import { compileScopedPlan } from "./scoped-plan";
import { watchProposal } from "./suggestion-watch";
import type { EditOperation } from "./types";

const MAX_OPTIONS = 4;
const QUESTION_LIMIT = 300;

/** 提问记录的提案 ID 由工具调用派生：对话卡片凭工具调用就能找到这条提问，不另存映射 */
export const questionProposalId = (toolCallId: string) =>
  `question_${toolCallId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 96)}`;

type AskResult =
  | { success: true; answered: true; answer: string }
  | { success: true; answered: false; message: string }
  | { success: false; errorCode: string; message: string };

const failure = (errorCode: string, message: string): AskResult => ({
  success: false,
  errorCode,
  message,
});

export async function askAboutContent(params: {
  context?: ToolExecutionContext;
  contentId?: number;
  quote: string;
  question: string;
  options: string[];
}): Promise<AskResult> {
  const { context } = params;
  const quote = params.quote.trim();
  const question = params.question.trim().slice(0, QUESTION_LIMIT);
  if (!context?.toolCallId || !context.conversationKey)
    return failure("UNSUPPORTED", "当前入口没有可作答的界面，请在回复里直接说明");
  if (!quote || !question) return failure("INVALID_ARGUMENT", "quote 与 question 不能为空");
  const resolved = await resolveContentTarget({ contentId: params.contentId }, context);
  const { snapshot } = await loadSnapshotForContent(resolved.contentId, context, true);
  if (!snapshot.editState) return failure("SNAPSHOT_REQUIRED", "正文快照不可用，无法锚定提问");
  const [candidate] = findContentRanges(snapshot, {
    queryText: quote,
    matchMode: "normalized",
    maxCandidates: 1,
  });
  if (!candidate) return failure("QUOTE_NOT_FOUND", "正文里找不到这段原文，请用正文中的原句");
  // 锚点是一次「原样替换」的范围编辑：只取它的位置与原文前提，不会被提交
  const operations: EditOperation[] = [
    {
      op: "replace",
      locator: { kind: "match-id", matchId: candidate.matchId },
      text: snapshot.markdown.slice(candidate.start, candidate.end),
    },
  ];
  let anchor;
  try {
    const { patches } = applyEditOperations({ snapshot, operations, selection: null });
    [anchor] = (await compileScopedPlan(snapshot, patches, operations)).edits;
  } catch {
    anchor = undefined;
  }
  if (!anchor) return failure("QUOTE_UNSUPPORTED", "这段原文无法锚定，请换一句完整的原句");
  const proposalId = questionProposalId(context.toolCallId);
  const options = [...new Set(params.options.map(option => option.trim()).filter(Boolean))].slice(
    0,
    MAX_OPTIONS
  );
  const record = await bindDatabaseCommands(
    { createContentQuestion },
    { databaseName: context.databaseName, signal: context.signal }
  ).createContentQuestion(resolved.contentId, {
    proposalId,
    conversationKey: context.conversationKey,
    ...(context.conversationKey.includes(":subagent:")
      ? { agentId: context.conversationKey.split(":subagent:")[1] }
      : {}),
    agentLabel: agentIdentity(context.toolContext?.agentTitle).name,
    baseline: snapshot.editState.identity,
    anchor,
    quote,
    question,
    options,
  });
  reportAgentPresence(context, resolved.contentId, {
    status: "waiting",
    action: "在问你一个问题",
    ...(anchor.kind === "text"
      ? { caret: { blockId: anchor.blockId, position: anchor.end }, block: anchor.blockId }
      : {}),
  });

  const outcome = await new Promise<{ answered: boolean; text?: string }>((resolve, reject) => {
    const onAbort = () => {
      watch.stop();
      reject(new Error("提问已中止"));
    };
    const watch = watchProposal({
      databaseName: context.databaseName,
      proposalId,
      onItems: items => {
        const item = items.find(entry => entry.id === record.id);
        if (!item || item.status === "pending") return false;
        context.signal?.removeEventListener("abort", onAbort);
        resolve(
          item.status === "answered"
            ? { answered: true, text: item.feedback ?? "" }
            : { answered: false }
        );
        return true;
      },
      onError: error => {
        context.signal?.removeEventListener("abort", onAbort);
        reject(error);
      },
    });
    context.signal?.addEventListener("abort", onAbort, { once: true });
    if (context.signal?.aborted) onAbort();
  });
  reportAgentPresence(context, resolved.contentId, {
    status: "busy",
    action: outcome.answered ? "收到你的回答，接着做" : "你跳过了这个问题，接着做",
  });
  return outcome.answered
    ? { success: true, answered: true, answer: outcome.text ?? "" }
    : {
        success: true,
        answered: false,
        message: "用户跳过了这个问题，按你的判断继续或在回复里说明",
      };
}
