import type { ToolDefinition, ToolExecutionResult } from "@/types";
import {
  ASK_QUESTION_TOOL_NAME,
  buildAskQuestionToolResult,
  normalizeAskQuestionPayload,
} from "./askQuestionTypes";
import { getAskQuestionSessionStore } from "./askQuestionSessionStore";

const stringifySafe = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const createParameterError = (message: string): ToolExecutionResult => ({
  content: message,
  isParameterError: true,
});

export const createAskQuestionTool = (): ToolDefinition => ({
  name: ASK_QUESTION_TOOL_NAME,
  description:
    "当需要进一步澄清用户意图时，向用户发起结构化问题。支持单选、多选和一次提出多个问题。",
  execution: {
    timeoutMs: null,
  },
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "问题分组标题，可选。",
      },
      description: {
        type: "string",
        description: "对问题分组的补充说明，可选。",
      },
      submitLabel: {
        type: "string",
        description: "提交按钮文案，可选。",
      },
      questions: {
        type: "array",
        description: "问题列表，至少一个。",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "问题唯一标识，可选，不传会自动生成。",
            },
            question: {
              type: "string",
              description: "问题文本。",
            },
            type: {
              type: "string",
              enum: ["single", "multiple"],
              description: "题型：single 单选，multiple 多选。",
            },
            required: {
              type: "boolean",
              description: "是否必答，默认 true。",
            },
            options: {
              type: "array",
              description:
                "选项列表。每项可为字符串，或 {label,value,description} 对象。",
              items: {
                type: "object",
              },
            },
          },
          required: ["question", "type", "options"],
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  },
  executor: async (args, context) => {
    if (!context?.toolCallId) {
      return createParameterError("ask-question 缺少 toolCallId 上下文");
    }

    const normalized = normalizeAskQuestionPayload(args);
    if (!normalized.payload) {
      return createParameterError(
        normalized.error || "ask-question 参数不合法",
      );
    }

    const conversationKey = context.conversationKey || "default";
    const rawInput = stringifySafe(args);
    const store = getAskQuestionSessionStore();

    const sessionRecord = store.createPending({
      toolCallId: context.toolCallId,
      toolName: ASK_QUESTION_TOOL_NAME,
      conversationKey,
      rawInput,
      payload: normalized.payload,
    });

    if (context.signal?.aborted) {
      store.cancelSession(sessionRecord.sessionId, "会话已中止");
      throw new Error("ask-question 会话已中止");
    }

    return await new Promise<ToolExecutionResult>((resolve, reject) => {
      const clearAbort = () => {
        if (context.signal) {
          context.signal.removeEventListener("abort", handleAbort);
        }
      };

      const handleAbort = () => {
        clearAbort();
        store.cancelSession(sessionRecord.sessionId, "会话已中止");
      };

      if (context.signal) {
        context.signal.addEventListener("abort", handleAbort, { once: true });
      }

      store.registerResolver(sessionRecord.sessionId, {
        resolve: (submission) => {
          clearAbort();
          const result = buildAskQuestionToolResult(
            normalized.payload!,
            submission,
          );
          store.completeSession(sessionRecord.sessionId);
          resolve({
            content: JSON.stringify(result, null, 2),
          });
        },
        reject: (error) => {
          clearAbort();
          reject(error);
        },
      });
    });
  },
});
