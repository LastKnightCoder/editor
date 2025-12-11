import {
  FlashcardType,
  FlashcardData,
  FlashcardReviewRating,
} from "@/types";
import type { Descendant } from "slate";

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
  bgColor: string;
  textColor: string;
  hoverBgColor: string;
  borderColor: string;
}> = [
  {
    value: "easy",
    label: "轻松",
    description: "记忆牢固，下次间隔更久",
    bgColor: "bg-emerald-100 dark:bg-emerald-500/15",
    textColor: "text-emerald-700 dark:text-emerald-400",
    hoverBgColor: "hover:bg-emerald-200 dark:hover:bg-emerald-500/25",
    borderColor: "border-emerald-300 dark:border-emerald-500/40",
  },
  {
    value: "normal",
    label: "一般",
    description: "基本掌握，保持当前节奏",
    bgColor: "bg-sky-100 dark:bg-sky-500/15",
    textColor: "text-sky-700 dark:text-sky-400",
    hoverBgColor: "hover:bg-sky-200 dark:hover:bg-sky-500/25",
    borderColor: "border-sky-300 dark:border-sky-500/40",
  },
  {
    value: "struggle",
    label: "较难",
    description: "略显吃力，稍微缩短间隔",
    bgColor: "bg-amber-100 dark:bg-amber-500/15",
    textColor: "text-amber-700 dark:text-amber-400",
    hoverBgColor: "hover:bg-amber-200 dark:hover:bg-amber-500/25",
    borderColor: "border-amber-300 dark:border-amber-500/40",
  },
  {
    value: "hard",
    label: "困难",
    description: "几乎遗忘，需尽快复习",
    bgColor: "bg-rose-100 dark:bg-rose-500/15",
    textColor: "text-rose-700 dark:text-rose-400",
    hoverBgColor: "hover:bg-rose-200 dark:hover:bg-rose-500/25",
    borderColor: "border-rose-300 dark:border-rose-500/40",
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

/**
 * Convert plain text to Descendant[] structure
 */
export const textToDescendants = (text: string): Descendant[] => {
  if (!text || text.trim() === "") {
    return [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }];
  }
  return [
    { type: "paragraph", children: [{ type: "formatted", text }] },
  ] as Descendant[];
};

/**
 * Parse text with {{blank:answer}} markers and convert to flashcard-blank elements
 * Example: "The capital of France is {{blank:Paris}}"
 * -> paragraph with text nodes and flashcard-blank nodes
 */
export const parseTextWithBlanks = (text: string): Descendant[] => {
  if (!text || text.trim() === "") {
    return [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }];
  }

  // Check if text contains blank markers
  const blankPattern = /\{\{blank:([^}]+)\}\}/g;
  if (!blankPattern.test(text)) {
    // No blanks, return as normal text
    return textToDescendants(text);
  }

  // Split text by lines to preserve paragraph structure
  const lines = text.split("\n");
  const paragraphs: Descendant[] = [];

  lines.forEach((line) => {
    const children: any[] = [];
    let lastIndex = 0;
    const lineBlankPattern = /\{\{blank:([^}]+)\}\}/g;
    let match;

    while ((match = lineBlankPattern.exec(line)) !== null) {
      // Add text before the blank
      if (match.index > lastIndex) {
        const textBefore = line.slice(lastIndex, match.index);
        children.push({ type: "formatted", text: textBefore });
      }

      // Add the blank node
      const answer = match[1].trim();
      children.push({
        type: "flashcard-blank",
        blankId: genId(),
        answer,
        placeholder: "",
        alternativeAnswers: [],
        children: [{ type: "formatted", text: answer }],
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last blank
    if (lastIndex < line.length) {
      children.push({ type: "formatted", text: line.slice(lastIndex) });
    }

    // If no children were added (empty line), add empty text node
    if (children.length === 0) {
      children.push({ type: "formatted", text: "" });
    }

    paragraphs.push({
      type: "paragraph",
      children,
    });
  });

  return paragraphs.length > 0
    ? paragraphs
    : [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }];
};

/**
 * Extract plain text from Descendant[] for search/preview
 */
export const extractPlainText = (descendants: Descendant[]): string => {
  const extractFromNode = (node: any): string => {
    if (typeof node === "string") {
      return node;
    }
    if (node.text !== undefined) {
      return node.text;
    }
    if (node.children && Array.isArray(node.children)) {
      return node.children.map(extractFromNode).join("");
    }
    return "";
  };

  return descendants.map(extractFromNode).join("\n").trim();
};

/**
 * Check if Descendant[] is empty
 */
export const isEmptyContent = (descendants: Descendant[]): boolean => {
  if (!descendants || descendants.length === 0) {
    return true;
  }
  const text = extractPlainText(descendants);
  return text.trim() === "";
};
