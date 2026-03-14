import { ChevronDown, PencilLine, RotateCcw } from "lucide-react";
import type { ChangePreview } from "@/utils/review-change-preview";

interface CompactSummaryProps {
  patchCount: number;
  insertedChars: number;
  deletedChars: number;
  isDark: boolean;
  expanded: boolean;
  onToggle: () => void;
  canUndo?: boolean;
  undoDisabled?: boolean;
  onUndo?: () => void;
}

export const CompactSummary = ({
  patchCount,
  insertedChars,
  deletedChars,
  isDark,
  expanded,
  onToggle,
  canUndo = false,
  undoDisabled = false,
  onUndo,
}: CompactSummaryProps) => (
  <div
    className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${
      isDark
        ? "border-white/10 bg-slate-950/40 text-slate-300"
        : "border-slate-200 bg-white text-slate-600"
    }`}
  >
    <span className="flex items-center gap-1.5 font-medium">
      <PencilLine className="h-4 w-4" />
      已修改 {patchCount} 处
    </span>
    <span className={isDark ? "text-slate-600" : "text-slate-400"}>·</span>
    <span className="font-medium text-emerald-600">+{insertedChars}</span>
    <span className="font-medium text-rose-600">-{deletedChars}</span>
    <div className="ml-auto flex items-center gap-1">
      {canUndo ? (
        <button
          type="button"
          aria-label="撤销这次应用"
          title="撤销这次应用"
          onClick={onUndo}
          disabled={undoDisabled}
          className={`rounded-lg p-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${
            isDark ? "hover:bg-white/5" : "hover:bg-slate-100"
          }`}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={expanded ? "收起改动摘要" : "展开改动摘要"}
        title={expanded ? "收起改动摘要" : "展开改动摘要"}
        onClick={onToggle}
        className={`rounded-lg p-1 transition ${
          isDark ? "hover:bg-white/5" : "hover:bg-slate-100"
        }`}
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
    </div>
  </div>
);

interface ChangePreviewCardProps {
  preview: ChangePreview;
  isDark: boolean;
}

export const ChangePreviewCard = ({
  preview,
  isDark,
}: ChangePreviewCardProps) => {
  const opLabelMap = {
    insert: { label: "新增", emoji: "➕", color: "blue" },
    delete: { label: "删除", emoji: "➖", color: "red" },
    replace: { label: "替换", emoji: "🔄", color: "yellow" },
  };

  const opInfo = opLabelMap[preview.op];

  return (
    <div
      className={`rounded-xl border p-4 shadow-sm transition hover:shadow-md ${
        isDark ? "border-white/10 bg-slate-900/50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
            opInfo.color === "blue"
              ? isDark
                ? "bg-blue-900/30 text-blue-300"
                : "bg-blue-50 text-blue-700"
              : opInfo.color === "red"
                ? isDark
                  ? "bg-red-900/30 text-red-300"
                  : "bg-red-50 text-red-700"
                : isDark
                  ? "bg-yellow-900/30 text-yellow-300"
                  : "bg-yellow-50 text-yellow-700"
          }`}
        >
          {opInfo.emoji} {opInfo.label}
        </span>
        <span
          className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}
        >
          {preview.location}
        </span>
      </div>
      <div className="space-y-1 text-sm">
        {preview.beforeTextPreview && (
          <div
            className={`line-through ${isDark ? "text-slate-500" : "text-slate-500"}`}
          >
            {preview.beforeTextPreview}
          </div>
        )}
        {preview.beforeTextPreview && preview.afterTextPreview && (
          <div
            className={`flex items-center gap-2 ${isDark ? "text-slate-600" : "text-slate-400"}`}
          >
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}
        {preview.afterTextPreview && (
          <div className={isDark ? "text-slate-200" : "text-slate-800"}>
            {preview.afterTextPreview}
          </div>
        )}
      </div>
    </div>
  );
};

interface FeedbackTemplatesProps {
  onSelect: (template: string) => void;
  isDark: boolean;
}

export const FeedbackTemplates = ({
  onSelect,
  isDark,
}: FeedbackTemplatesProps) => {
  const templates = [
    "语气更自然",
    "保持原意但更精炼",
    "不要改标题",
    "第一段需要调整",
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {templates.map((template) => (
        <button
          key={template}
          onClick={() => onSelect(template)}
          className={`rounded-full border px-3 py-1.5 text-sm transition ${
            isDark
              ? "border-white/10 bg-slate-900/50 text-slate-300 hover:border-white/20 hover:bg-slate-800/50"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          {template}
        </button>
      ))}
    </div>
  );
};
