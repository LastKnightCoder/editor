import {
  ArrowDown,
  ArrowLeftRight,
  ChevronDown,
  Minus,
  PencilLine,
  Plus,
  RotateCcw,
} from "lucide-react";
import { IconButton, cn } from "@tau/ui";
import type { ChangePreview } from "@/utils/review-change-preview";

interface CompactSummaryProps {
  patchCount: number;
  insertedChars: number;
  deletedChars: number;
  /** 兼容保留：取色已走语义 token，不再按主题分支 */
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
  expanded,
  onToggle,
  canUndo = false,
  undoDisabled = false,
  onUndo,
}: CompactSummaryProps) => (
  <div className="bg-hover text-ink-2 text-tau-meta rounded-tau-sm flex h-9 items-center gap-2 pl-3 pr-1">
    <span className="text-ink-1 flex items-center gap-1.5 font-medium">
      <PencilLine size={14} strokeWidth={1.75} className="text-ink-2" />
      已修改 {patchCount} 处
    </span>
    <span aria-hidden className="text-ink-3">
      ·
    </span>
    <span className="text-ok font-medium tabular-nums">+{insertedChars}</span>
    <span className="text-danger font-medium tabular-nums">-{deletedChars}</span>
    <div className="ml-auto flex items-center gap-0.5">
      {canUndo ? (
        <IconButton
          className="size-[26px]"
          aria-label="撤销这次应用"
          title="撤销这次应用"
          onClick={onUndo}
          disabled={undoDisabled}
        >
          <RotateCcw size={14} strokeWidth={1.75} />
        </IconButton>
      ) : null}
      <IconButton
        className="size-[26px]"
        aria-label={expanded ? "收起改动摘要" : "展开改动摘要"}
        title={expanded ? "收起改动摘要" : "展开改动摘要"}
        onClick={onToggle}
      >
        <ChevronDown
          size={15}
          strokeWidth={1.75}
          className={cn(
            "ease-tau-out transition-transform duration-[160ms]",
            expanded && "rotate-180"
          )}
        />
      </IconButton>
    </div>
  </div>
);

interface ChangePreviewCardProps {
  preview: ChangePreview;
  /** 兼容保留：取色已走语义 token，不再按主题分支 */
  isDark: boolean;
}

const OP_INFO = {
  insert: { label: "新增", Icon: Plus, tone: "text-ok" },
  delete: { label: "删除", Icon: Minus, tone: "text-danger" },
  replace: { label: "替换", Icon: ArrowLeftRight, tone: "text-warn" },
} as const;

export const ChangePreviewCard = ({ preview }: ChangePreviewCardProps) => {
  const opInfo = OP_INFO[preview.op];
  const OpIcon = opInfo.Icon;

  return (
    <div className="border-line-1 rounded-tau-sm border px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className={cn("text-tau-sm inline-flex items-center gap-1 font-medium", opInfo.tone)}>
          <OpIcon size={13} strokeWidth={1.75} />
          {opInfo.label}
        </span>
        {preview.location ? (
          <span className="text-ink-3 text-tau-tiny min-w-0 truncate">{preview.location}</span>
        ) : null}
      </div>
      <div className="text-tau-body space-y-1 leading-[1.6]">
        {preview.beforeTextPreview && (
          <div className="text-ink-3 break-words line-through">{preview.beforeTextPreview}</div>
        )}
        {preview.beforeTextPreview && preview.afterTextPreview && (
          <div className="text-ink-3 flex items-center">
            <ArrowDown size={12} strokeWidth={1.75} />
          </div>
        )}
        {preview.afterTextPreview && (
          <div className="text-ink-1 break-words">{preview.afterTextPreview}</div>
        )}
      </div>
    </div>
  );
};

interface FeedbackTemplatesProps {
  onSelect: (template: string) => void;
  /** 兼容保留：取色已走语义 token，不再按主题分支 */
  isDark: boolean;
}

const FEEDBACK_TEMPLATES = ["语气更自然", "保持原意但更精炼", "不要改标题", "第一段需要调整"];

export const FeedbackTemplates = ({ onSelect }: FeedbackTemplatesProps) => (
  <div className="flex flex-wrap gap-1.5">
    {FEEDBACK_TEMPLATES.map(template => (
      <button
        key={template}
        type="button"
        onClick={() => onSelect(template)}
        className="border-line-1 bg-surface text-ink-2 text-tau-meta hover:bg-surface-hover hover:text-ink-1 active:bg-press ease-tau-out inline-flex h-7 cursor-pointer items-center rounded-full border px-3 transition-colors duration-[140ms]"
      >
        {template}
      </button>
    ))}
  </div>
);
