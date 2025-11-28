import { FlashcardType, FlashcardData, FlashcardReviewRating } from "@/types";

const genId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
};

export const FLASHCARD_TYPE_META: Record<
  FlashcardType,
  { label: string; description: string }
> = {
  "single-choice": {
    label: "单选题",
    description: "设置一个正确答案，其余为干扰项",
  },
  "multiple-choice": {
    label: "多选题",
    description: "支持多个正确答案，适合概念组合记忆",
  },
  cloze: {
    label: "填空题",
    description: "根据提示填写答案，适合考察知识点细节",
  },
  qa: {
    label: "问答题",
    description: "自由回答型题目，适合总结与表述",
  },
  boolean: {
    label: "判断题",
    description: "适合快速判断概念正误",
  },
};

export const REVIEW_RATINGS: Array<{
  value: FlashcardReviewRating;
  label: string;
  description: string;
  gradient: string;
}> = [
  {
    value: "easy",
    label: "轻松",
    description: "记忆牢固，下次间隔更久",
    gradient: "from-emerald-400 via-emerald-500 to-emerald-600",
  },
  {
    value: "normal",
    label: "一般",
    description: "基本掌握，保持当前节奏",
    gradient: "from-sky-400 via-sky-500 to-sky-600",
  },
  {
    value: "struggle",
    label: "较难",
    description: "略显吃力，稍微缩短间隔",
    gradient: "from-amber-400 via-amber-500 to-amber-600",
  },
  {
    value: "hard",
    label: "困难",
    description: "几乎遗忘，需尽快复习",
    gradient: "from-rose-400 via-rose-500 to-rose-600",
  },
];

export const flashcardDeckColors = [
  "#2563eb",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#8b5cf6",
  "#ef4444",
];

export const flashcardDeckEmojis = [
  "🧠",
  "📚",
  "⚡",
  "🎯",
  "🧩",
  "🔬",
  "🌟",
  "🚀",
  "💡",
  "📝",
];

export const createEmptyFlashcardData = (
  type: FlashcardType,
): FlashcardData => {
  switch (type) {
    case "single-choice":
      return {
        options: [
          { id: genId(), label: "", isCorrect: true },
          { id: genId(), label: "", isCorrect: false },
        ],
        explanation: "",
      };
    case "multiple-choice":
      return {
        options: [
          { id: genId(), label: "", isCorrect: true },
          { id: genId(), label: "", isCorrect: true },
          { id: genId(), label: "", isCorrect: false },
        ],
        explanation: "",
      };
    case "cloze":
      return {
        richContent: [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "" }],
          },
        ],
        hint: "",
        explanation: "",
      };
    case "qa":
      return {
        answer: "",
        explanation: "",
        hint: "",
      };
    case "boolean":
      return {
        booleanAnswer: true,
        explanation: "",
      };
    default:
      return {};
  }
};

export const formatDueTime = (dueTime: number): string => {
  const diff = dueTime - Date.now();
  if (diff <= 0) {
    return "立即复习";
  }
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) {
    return `${minutes} 分钟后`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时后`;
  }
  const days = Math.floor(hours / 24);
  return `${days} 天后`;
};
