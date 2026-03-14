import type { ChangePreview } from "@/utils/review-change-preview";

interface CompactSummaryProps {
  patchCount: number;
  insertedChars: number;
  deletedChars: number;
  isDark: boolean;
  expanded: boolean;
  onToggle: () => void;
}

export const CompactSummary = ({
  patchCount,
  insertedChars,
  deletedChars,
  isDark,
  expanded,
  onToggle,
}: CompactSummaryProps) => (
  <div
    className={`flex items-center gap-2 text-sm ${
      isDark ? "text-slate-400" : "text-slate-600"
    }`}
  >
    <span className="flex items-center gap-1">
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
        />
      </svg>
      已修改 {patchCount} 处
    </span>
    <span className={isDark ? "text-slate-600" : "text-slate-400"}>·</span>
    <span className="text-green-600">+{insertedChars}</span>
    <span className="text-red-600">-{deletedChars}</span>
    <button
      onClick={onToggle}
      className={`ml-auto rounded-lg p-1 transition ${
        isDark ? "hover:bg-white/5" : "hover:bg-slate-100"
      }`}
    >
      <svg
        className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>
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
