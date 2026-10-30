// 工具交互宿主：@tau/chat-ui 的审批条与提问卡从对话状态里读等待项，按 toolCallId 对应到工具行。

import {
  configureToolInteractions,
  registerInteractionRenderers,
  type PendingToolApproval,
  type PendingToolQuestion,
  type ToolInteractionHost,
} from "@tau/chat-ui/conversation";
import type { AiApproval, AiQuestion } from "../../services/ai";
import {
  answerQuestion,
  resolveApproval,
  useChatStore,
} from "../../services/aiChat/chatController";

const RISK_LABEL: Record<string, string> = {
  read: "读取数据",
  write: "修改你的数据",
  execute: "执行操作",
};

/** 宿主工具的可读叫法；插件工具与未知工具回落为工具名 */
export const TOOL_LABELS: Record<string, string> = {
  get_current_date: "查看日期",
  search_knowledge: "搜索笔记",
  get_content_markdown: "读取笔记",
  sql_query: "查询数据库",
  query_todos: "查询待办",
  query_calendar_events: "查询日程",
  create_todo: "新建待办",
  update_todo: "修改待办",
  set_todo_completed: "完成待办",
  delete_todo: "删除待办",
  create_calendar_event: "新建日程",
  update_calendar_event: "修改日程",
  delete_calendar_event: "删除日程",
  load_skill: "读取技能说明",
  read_skill_resource: "读取技能资料",
  "ask-question": "向你提问",
};

const WRITE_TOOLS = new Set([
  "create_todo",
  "update_todo",
  "set_todo_completed",
  "delete_todo",
  "create_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
]);

function findBySession(toolCallId: string) {
  for (const chat of Object.values(useChatStore.getState().chats)) {
    const approval = chat.approvals.find(item => item.toolCallId === toolCallId);
    const question = chat.questions.find(item => item.toolCallId === toolCallId);
    if (approval || question) return { chat, approval, question };
  }
  return null;
}

/** useSyncExternalStore 要求同一状态读出同一引用：按原等待项缓存映射结果 */
const approvalViews = new WeakMap<AiApproval, PendingToolApproval>();
const questionViews = new WeakMap<AiQuestion, PendingToolQuestion>();

function approvalView(approval: AiApproval) {
  let view = approvalViews.get(approval);
  if (!view) {
    view = {
      requestId: approval.requestId,
      toolName: approval.toolName,
      risk: WRITE_TOOLS.has(approval.toolName) ? "write" : "execute",
      input: JSON.stringify(approval.input ?? {}),
    };
    approvalViews.set(approval, view);
  }
  return view;
}

function questionView(question: AiQuestion) {
  let view = questionViews.get(question);
  if (!view) {
    view = { requestId: question.requestId, payload: question.payload };
    questionViews.set(question, view);
  }
  return view;
}

export function createChatInteractionHost(): ToolInteractionHost {
  return {
    subscribe: listener =>
      useChatStore.subscribe((state, previous) => {
        if (state.chats !== previous.chats) listener();
      }),
    approvalOf: execution => {
      const approval = findBySession(execution.toolCallId)?.approval;
      return approval ? approvalView(approval) : undefined;
    },
    questionOf: execution => {
      const question = findBySession(execution.toolCallId)?.question;
      return question ? questionView(question) : undefined;
    },
    isReady: execution => !!findBySession(execution.toolCallId)?.chat.runId,
    decideApproval: async (execution, _request, choice) => {
      const found = findBySession(execution.toolCallId);
      if (found?.approval) await resolveApproval(found.chat.sessionId, found.approval, choice);
    },
    answerQuestion: async (execution, _request, answers) => {
      const found = findBySession(execution.toolCallId);
      if (found?.question)
        await answerQuestion(found.chat.sessionId, found.question, {
          answers,
          submittedAt: Date.now(),
        });
    },
    riskLabel: risk => RISK_LABEL[risk] ?? risk,
  };
}

let configured = false;
/** 对话页首次挂载时登记一次；宿主为模块级单例 */
export function ensureChatInteractions() {
  if (configured) return;
  configured = true;
  registerInteractionRenderers();
  configureToolInteractions(createChatInteractionHost());
}
