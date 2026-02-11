import React from "react";
import { motion } from "motion/react";
import classNames from "classnames";
import type { AIJudgementResult } from "@/types/flashcard";

interface AIJudgementResultProps {
  result: AIJudgementResult;
  isDark: boolean;
}

const getScoreColor = (score: number) => {
  if (score >= 8)
    return {
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
      text: "text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-200 dark:border-emerald-500/30",
      ring: "border-emerald-400 dark:border-emerald-500",
    };
  if (score >= 6)
    return {
      bg: "bg-sky-50 dark:bg-sky-500/10",
      text: "text-sky-600 dark:text-sky-400",
      border: "border-sky-200 dark:border-sky-500/30",
      ring: "border-sky-400 dark:border-sky-500",
    };
  if (score >= 4)
    return {
      bg: "bg-amber-50 dark:bg-amber-500/10",
      text: "text-amber-600 dark:text-amber-400",
      border: "border-amber-200 dark:border-amber-500/30",
      ring: "border-amber-400 dark:border-amber-500",
    };
  return {
    bg: "bg-rose-50 dark:bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    border: "border-rose-200 dark:border-rose-500/30",
    ring: "border-rose-400 dark:border-rose-500",
  };
};

const getScoreLabel = (score: number) => {
  if (score >= 9) return "优秀";
  if (score >= 7) return "良好";
  if (score >= 5) return "及格";
  return "需加强";
};

const AIJudgementResultView: React.FC<AIJudgementResultProps> = ({
  result,
}) => {
  const scoreColors = getScoreColor(result.score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={classNames(
        "rounded-xl border-2 overflow-hidden",
        scoreColors.border,
        scoreColors.bg,
      )}
    >
      {/* Header with score */}
      <div className="p-4 flex items-center gap-4">
        {/* Score circle */}
        <div
          className={classNames(
            "w-16 h-16 rounded-full flex flex-col items-center justify-center border-4",
            scoreColors.ring,
            "bg-white dark:bg-gray-900",
          )}
        >
          <span className={classNames("text-2xl font-bold", scoreColors.text)}>
            {result.score}
          </span>
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            / 10
          </span>
        </div>

        {/* Comment */}
        <div className="flex-1">
          <div className={classNames("font-semibold mb-1", scoreColors.text)}>
            {getScoreLabel(result.score)}
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {result.comment}
          </p>
        </div>
      </div>

      {/* Detail content */}
      <div className="border-t border-gray-200 dark:border-gray-700/50 px-4 py-3 space-y-3 bg-white/50 dark:bg-gray-900/50">
        {/* Highlights */}
        {result.highlights.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1.5">
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              回答亮点
            </div>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 pl-1">
              {result.highlights.map((item, idx) => (
                <li key={idx} className="flex items-baseline gap-2">
                  <span className="text-emerald-500 text-[8px]">●</span>
                  <span className="flex-1">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Missing points */}
        {result.missingPoints.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 mb-1.5">
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              遗漏的关键点
            </div>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 pl-1">
              {result.missingPoints.map((item, idx) => (
                <li key={idx} className="flex items-baseline gap-2">
                  <span className="text-amber-500 text-[8px]">●</span>
                  <span className="flex-1">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggestions */}
        {result.suggestions.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 mb-1.5">
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              改进建议
            </div>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 pl-1">
              {result.suggestions.map((item, idx) => (
                <li key={idx} className="flex items-baseline gap-2">
                  <span className="text-blue-500 text-[8px]">●</span>
                  <span className="flex-1">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Loading state component
export const AIJudgementLoading: React.FC = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="p-4 rounded-xl border-2 border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10"
  >
    <div className="flex items-center gap-3">
      <div className="relative w-8 h-8">
        <div className="absolute inset-0 rounded-full border-2 border-blue-200 dark:border-blue-500/30" />
        <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
      <div>
        <div className="font-medium text-blue-700 dark:text-blue-400">
          AI 正在评判...
        </div>
        <div className="text-xs text-blue-600/70 dark:text-blue-400/70">
          分析你的答案，请稍候
        </div>
      </div>
    </div>
  </motion.div>
);

// Error state component
export const AIJudgementError: React.FC<{
  message: string;
  onRetry?: () => void;
}> = ({ message, onRetry }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="p-4 rounded-xl border-2 border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10"
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <svg
          className="w-6 h-6 text-rose-500"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        <div>
          <div className="font-medium text-rose-700 dark:text-rose-400">
            评判失败
          </div>
          <div className="text-xs text-rose-600/70 dark:text-rose-400/70">
            {message}
          </div>
        </div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-500/30 transition-colors"
        >
          重试
        </button>
      )}
    </div>
  </motion.div>
);

export default AIJudgementResultView;
