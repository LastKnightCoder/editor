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

import { useReviewToolI18n } from "./review.i18n";

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
}: CompactSummaryProps) => {
  const { t } = useReviewToolI18n();
  return (
    <div className="bg-hover text-ink-2 text-tau-meta rounded-tau-sm flex h-9 items-center gap-2 pr-1 pl-3">
      <span className="text-ink-1 flex items-center gap-1.5 font-medium">
        <PencilLine size={14} strokeWidth={1.75} className="text-ink-2" />
        {t("review.changed", { count: patchCount })}
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
            aria-label={t("review.undoApply")}
            title={t("review.undoApply")}
            onClick={onUndo}
            disabled={undoDisabled}
          >
            <RotateCcw size={14} strokeWidth={1.75} />
          </IconButton>
        ) : null}
        <IconButton
          className="size-[26px]"
          aria-label={expanded ? t("review.collapseSummary") : t("review.expandSummary")}
          title={expanded ? t("review.collapseSummary") : t("review.expandSummary")}
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
};

interface ChangePreviewCardProps {
  preview: ChangePreview;
  /** 兼容保留：取色已走语义 token，不再按主题分支 */
  isDark: boolean;
}

const OP_INFO = {
  insert: { Icon: Plus, tone: "text-ok" },
  delete: { Icon: Minus, tone: "text-danger" },
  replace: { Icon: ArrowLeftRight, tone: "text-warn" },
} as const;

export const ChangePreviewCard = ({ preview }: ChangePreviewCardProps) => {
  const { t } = useReviewToolI18n();
  const opInfo = OP_INFO[preview.op];
  const OpIcon = opInfo.Icon;

  return (
    <div className="border-line-1 rounded-tau-sm border px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className={cn("text-tau-sm inline-flex items-center gap-1 font-medium", opInfo.tone)}>
          <OpIcon size={13} strokeWidth={1.75} />
          {t(`review.operation.${preview.op}`)}
        </span>
        {typeof preview.locationIndex === "number" ? (
          <span className="text-ink-3 text-tau-tiny min-w-0 truncate">
            {t("review.location", { index: preview.locationIndex + 1 })}
          </span>
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

const FEEDBACK_TEMPLATES = [
  { id: "tone", value: "语气更自然" },
  { id: "concise", value: "保持原意但更精炼" },
  { id: "title", value: "不要改标题" },
  { id: "opening", value: "第一段需要调整" },
] as const;

export const FeedbackTemplates = ({ onSelect }: FeedbackTemplatesProps) => {
  const { t } = useReviewToolI18n();
  return (
    <div className="flex flex-wrap gap-1.5">
      {FEEDBACK_TEMPLATES.map(template => (
        <button
          key={template.id}
          type="button"
          onClick={() => onSelect(template.value)}
          className="border-line-1 bg-surface text-ink-2 text-tau-meta hover:bg-surface-hover hover:text-ink-1 active:bg-press ease-tau-out inline-flex h-7 cursor-pointer items-center rounded-full border px-3 transition-colors duration-[140ms]"
        >
          {t(`review.template.${template.id}`)}
        </button>
      ))}
    </div>
  );
};
