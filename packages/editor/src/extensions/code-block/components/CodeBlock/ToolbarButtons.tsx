import { memo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
} from "lucide-react";

/** 代码块悬停 group 名：容器加它，工具条随悬停显隐（代码块不会嵌套代码块） */
export const CODE_HOVER_GROUP = "group/code";

const ICON_BUTTON_CLASS =
  "flex h-[1.9em] w-[1.9em] cursor-pointer items-center justify-center border-0 bg-transparent text-inherit disabled:cursor-not-allowed disabled:opacity-40";
const DIVIDER_CLASS = "h-[1.1em] w-px bg-[rgba(255,255,255,0.28)]";

interface ToolbarButtonsProps {
  onCopy: () => void;
  onDiffPrimaryAction?: () => void;
  onDeleteCurrentStep?: () => void;
  canDeleteCurrentStep?: boolean;
  diffEnabled?: boolean;
  onFullscreen?: () => void;
  showFullscreen?: boolean;
  isFullscreen?: boolean;
  onPreviousStep?: () => void;
  onNextStep?: () => void;
  hasPreviousStep?: boolean;
  hasNextStep?: boolean;
  showStepNavigation?: boolean;
  currentStep?: number;
  totalSteps?: number;
}

const ToolbarButtons = memo<ToolbarButtonsProps>(
  ({
    onCopy,
    onDiffPrimaryAction,
    onDeleteCurrentStep,
    canDeleteCurrentStep = false,
    diffEnabled = false,
    onFullscreen,
    showFullscreen = false,
    isFullscreen = false,
    onPreviousStep,
    onNextStep,
    hasPreviousStep = false,
    hasNextStep = false,
    showStepNavigation = false,
    currentStep = 0,
    totalSteps = 0,
  }) => (
    // 压在代码底色上的固定深色条，不随主题
    <div className="pointer-events-none absolute right-[0.625em] top-[0.625em] z-[4] flex items-center rounded-[0.5em] bg-[rgba(38,38,38,0.68)] text-white opacity-0 transition-opacity duration-200 ease-[ease] group-hover/code:pointer-events-auto group-hover/code:opacity-100">
      {onDiffPrimaryAction && (
        <button
          type="button"
          className={ICON_BUTTON_CLASS}
          onClick={onDiffPrimaryAction}
          aria-label={diffEnabled ? "新增下一步" : "开启 Diff 动画"}
        >
          {diffEnabled ? <Plus size={16} /> : <Code2 size={16} />}
        </button>
      )}
      {showFullscreen && onFullscreen && (
        <button
          type="button"
          className={ICON_BUTTON_CLASS}
          onClick={onFullscreen}
          aria-label={isFullscreen ? "退出全屏编辑" : "全屏编辑"}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      )}
      {diffEnabled && onDeleteCurrentStep && (
        <button
          type="button"
          className={ICON_BUTTON_CLASS}
          onClick={onDeleteCurrentStep}
          disabled={!canDeleteCurrentStep}
          aria-label="删除当前步骤"
        >
          <Trash2 size={16} />
        </button>
      )}
      {showStepNavigation && (
        <>
          <div className={DIVIDER_CLASS} />
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            onClick={onPreviousStep}
            disabled={!hasPreviousStep}
            aria-label="上一步"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            onClick={onNextStep}
            disabled={!hasNextStep}
            aria-label="下一步"
          >
            <ChevronRight size={16} />
          </button>
          <span
            className="min-w-[3.4em] select-none px-[0.2em] text-center font-[family-name:var(--ed-font-mono)] text-[0.72em] leading-none opacity-[0.92]"
            aria-label="步骤进度"
          >
            {`${currentStep}/${totalSteps}`}
          </span>
        </>
      )}
      <div className={DIVIDER_CLASS} />
      <button type="button" className={ICON_BUTTON_CLASS} onClick={onCopy} aria-label="复制代码">
        <Copy className="h-[0.92em] w-[0.92em]" size={16} />
      </button>
    </div>
  )
);

ToolbarButtons.displayName = "ToolbarButtons";

export default ToolbarButtons;
