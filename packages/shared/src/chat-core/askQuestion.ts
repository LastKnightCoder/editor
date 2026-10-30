/** ask-question 提问工具的载荷、作答与结果（纯数据，主进程、渲染端与浏览器扩展共用） */

export const ASK_QUESTION_TOOL_NAME = "ask-question" as const;

export const ASK_QUESTION_DESCRIPTION =
  "当需要进一步澄清用户意图时，向用户发起结构化问题。支持单选、多选和一次提出多个问题。";

/** ask-question 的模型入参 schema：桌面 pi 会话与移动运行时共用 */
export const ASK_QUESTION_PARAMETERS = {
  type: "object",
  properties: {
    title: { type: "string", description: "问题分组标题，可选。" },
    description: { type: "string", description: "对问题分组的补充说明，可选。" },
    submitLabel: { type: "string", description: "提交按钮文案，可选。" },
    questions: {
      type: "array",
      description: "问题列表，至少一个。",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "问题唯一标识，可选，不传会自动生成。" },
          question: { type: "string", description: "问题文本。" },
          type: {
            type: "string",
            enum: ["single", "multiple"],
            description: "题型：single 单选，multiple 多选。",
          },
          required: { type: "boolean", description: "是否必答，默认 true。" },
          options: {
            type: "array",
            description: "选项列表。每项可为字符串，或 {label,value,description} 对象。",
            // pi 执行前按 schema 校验参数：必须与描述一致地接受字符串选项
            items: {
              anyOf: [
                { type: "string" },
                {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    value: { type: "string" },
                    description: { type: "string" },
                  },
                },
              ],
            },
          },
        },
        required: ["question", "type", "options"],
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

export type AskQuestionType = "single" | "multiple";

export interface AskQuestionOption {
  label: string;
  value: string;
  description?: string;
}

export interface AskQuestionItem {
  id: string;
  question: string;
  type: AskQuestionType;
  options: AskQuestionOption[];
  required: boolean;
}

export interface AskQuestionPayload {
  title?: string;
  description?: string;
  submitLabel?: string;
  questions: AskQuestionItem[];
}

export interface AskQuestionAnswerItem {
  questionId: string;
  selectedValues: string[];
  otherText: string;
}

export interface AskQuestionSubmission {
  answers: AskQuestionAnswerItem[];
  submittedAt: number;
}

export interface AskQuestionResolvedAnswer {
  questionId: string;
  question: string;
  type: AskQuestionType;
  required: boolean;
  selectedOptions: Array<{
    value: string;
    label: string;
  }>;
  otherText: string;
}

export interface AskQuestionToolResult {
  type: "ask-question-result";
  submittedAt: number;
  answers: AskQuestionResolvedAnswer[];
}

export interface AskQuestionNormalizationResult {
  payload?: AskQuestionPayload;
  error?: string;
}

const ensureString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeOption = (
  value: unknown,
  questionIndex: number,
  optionIndex: number
): AskQuestionOption | null => {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    return { label: text, value: text };
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const label = ensureString(record.label);
  const rawValue = ensureString(record.value);
  const description = ensureString(record.description) || undefined;

  if (!label && !rawValue) {
    return null;
  }

  const finalLabel = label || rawValue || `选项 ${questionIndex + 1}-${optionIndex + 1}`;
  const finalValue = rawValue || finalLabel;
  return {
    label: finalLabel,
    value: finalValue,
    description,
  };
};

export const normalizeAskQuestionPayload = (input: unknown): AskQuestionNormalizationResult => {
  if (!input || typeof input !== "object") {
    return { error: "ask-question 参数必须是对象" };
  }

  const source = input as Record<string, unknown>;
  const questions = source.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    return { error: "ask-question 参数必须包含非空 questions 数组" };
  }

  const normalizedQuestions: AskQuestionItem[] = [];

  questions.forEach((questionValue, questionIndex) => {
    if (!questionValue || typeof questionValue !== "object") {
      return;
    }

    const item = questionValue as Record<string, unknown>;
    const questionText = ensureString(item.question);
    if (!questionText) {
      return;
    }

    const id = ensureString(item.id) || `question-${questionIndex + 1}`;

    const rawType = ensureString(item.type);
    const type: AskQuestionType = rawType === "multiple" ? "multiple" : "single";

    const rawOptions = Array.isArray(item.options) ? item.options : [];
    const options = rawOptions
      .map((option, optionIndex) => normalizeOption(option, questionIndex, optionIndex))
      .filter((option): option is AskQuestionOption => Boolean(option));

    normalizedQuestions.push({
      id,
      question: questionText,
      type,
      options,
      required: item.required !== false,
    });
  });

  if (normalizedQuestions.length === 0) {
    return { error: "ask-question 至少需要一个合法问题" };
  }

  return {
    payload: {
      title: ensureString(source.title) || undefined,
      description: ensureString(source.description) || undefined,
      submitLabel: ensureString(source.submitLabel) || undefined,
      questions: normalizedQuestions,
    },
  };
};

/** 第一个未作答的必答题（既没选项也没填「其他」）；全部答完返回 undefined */
export const findUnansweredQuestion = (
  payload: AskQuestionPayload,
  answers: AskQuestionAnswerItem[]
): AskQuestionItem | undefined => {
  const answerMap = new Map(answers.map(answer => [answer.questionId, answer]));
  return payload.questions.find(question => {
    if (!question.required) return false;
    const answer = answerMap.get(question.id);
    return (answer?.selectedValues ?? []).length === 0 && !answer?.otherText?.trim();
  });
};

export const buildAskQuestionToolResult = (
  payload: AskQuestionPayload,
  submission: AskQuestionSubmission
): AskQuestionToolResult => {
  const answerMap = new Map(submission.answers.map(answer => [answer.questionId, answer]));

  return {
    type: "ask-question-result",
    submittedAt: submission.submittedAt,
    answers: payload.questions.map(question => {
      const answer = answerMap.get(question.id);
      const selectedValues = answer?.selectedValues || [];
      const optionMap = new Map(question.options.map(option => [option.value, option.label]));

      return {
        questionId: question.id,
        question: question.question,
        type: question.type,
        required: question.required,
        selectedOptions: selectedValues.map(value => ({
          value,
          label: optionMap.get(value) || value,
        })),
        otherText: answer?.otherText || "",
      };
    }),
  };
};
