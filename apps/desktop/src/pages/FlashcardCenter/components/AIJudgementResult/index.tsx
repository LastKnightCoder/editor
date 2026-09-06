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
      bg: "bg-[var(--th-success)]/10",
      text: "text-status-success",
      border: "border-[var(--th-success)]/30",
      ring: "border-[var(--th-success)]",
    };
  if (score >= 6)
    return {
      bg: "bg-[var(--th-info)]/10",
      text: "text-status-info",
      border: "border-[var(--th-info)]/30",
      ring: "border-[var(--th-info)]",
    };
  if (score >= 4)
    return {
      bg: "bg-[var(--th-warning)]/10",
      text: "text-status-warning",
      border: "border-[var(--th-warning)]/30",
      ring: "border-[var(--th-warning)]",
    };
  return {
    bg: "bg-[var(--th-danger)]/10",
    text: "text-status-error",
    border: "border-[var(--th-danger)]/30",
    ring: "border-[var(--th-danger)]",
  };
};

const getScoreLabel = (score: number) => {
  if (score >= 9) return "优秀";
  if (score >= 7) return "良好";
  if (score >= 5) return "及格";
  return "需加强";
};

const AIJudgementResultView: React.FC<AIJudgementResultProps> = ({ result }) => {
  const scoreColors = getScoreColor(result.score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={classNames(
        "overflow-hidden rounded-xl border-2",
        scoreColors.border,
        scoreColors.bg
      )}
    >
      {/* Header with score */}
      <div className="flex items-center gap-4 p-4">
        {/* Score circle */}
        <div
          className={classNames(
            "flex h-16 w-16 flex-col items-center justify-center rounded-full border-4",
            scoreColors.ring,
            "bg-white dark:bg-zinc-900"
          )}
        >
          <span className={classNames("text-2xl font-bold", scoreColors.text)}>{result.score}</span>
          <span className="text-[10px] text-gray-500 dark:text-gray-400">/ 10</span>
        </div>

        {/* Comment */}
        <div className="flex-1">
          <div className={classNames("mb-1 font-semibold", scoreColors.text)}>
            {getScoreLabel(result.score)}
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300">{result.comment}</p>
        </div>
      </div>

      {/* Detail content */}
      <div className="space-y-3 border-t border-gray-200 bg-white/50 px-4 py-3 dark:border-gray-700/50 dark:bg-zinc-900/50">
        {/* Highlights */}
        {result.highlights.length > 0 && (
          <div>
            <div className="text-status-success mb-1.5 flex items-center gap-1.5 text-xs font-medium">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              回答亮点
            </div>
            <ul className="space-y-1 pl-1 text-sm text-gray-600 dark:text-gray-400">
              {result.highlights.map((item, idx) => (
                <li key={idx} className="flex items-baseline gap-2">
                  <span className="text-status-success text-[8px]">●</span>
                  <span className="flex-1">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Missing points */}
        {result.missingPoints.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              遗漏的关键点
            </div>
            <ul className="space-y-1 pl-1 text-sm text-gray-600 dark:text-gray-400">
              {result.missingPoints.map((item, idx) => (
                <li key={idx} className="flex items-baseline gap-2">
                  <span className="text-[8px] text-amber-500">●</span>
                  <span className="flex-1">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggestions */}
        {result.suggestions.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--th-active-text)]">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              改进建议
            </div>
            <ul className="space-y-1 pl-1 text-sm text-gray-600 dark:text-gray-400">
              {result.suggestions.map((item, idx) => (
                <li key={idx} className="flex items-baseline gap-2">
                  <span className="text-[8px] text-blue-500">●</span>
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
    className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10"
  >
    <div className="flex items-center gap-3">
      <div className="relative h-8 w-8">
        <div className="border-[var(--th-border-focus)]/30 absolute inset-0 rounded-full border-2" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
      <div>
        <div className="font-medium text-blue-700 dark:text-blue-400">AI 正在评判...</div>
        <div className="text-xs text-blue-600/70 dark:text-blue-400/70">分析你的答案，请稍候</div>
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
    className="rounded-xl border-2 border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10"
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <svg className="h-6 w-6 text-rose-500" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        <div>
          <div className="font-medium text-rose-700 dark:text-rose-400">评判失败</div>
          <div className="text-xs text-rose-600/70 dark:text-rose-400/70">{message}</div>
        </div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/30"
        >
          重试
        </button>
      )}
    </div>
  </motion.div>
);

export default AIJudgementResultView;
