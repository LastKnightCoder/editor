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
import styles from "./index.module.less";

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
    <div className={styles.btnGroup}>
      {onDiffPrimaryAction && (
        <button
          type="button"
          className={styles.iconButton}
          onClick={onDiffPrimaryAction}
          aria-label={diffEnabled ? "新增下一步" : "开启 Diff 动画"}
        >
          {diffEnabled ? <Plus size={16} /> : <Code2 size={16} />}
        </button>
      )}
      {showFullscreen && onFullscreen && (
        <button
          type="button"
          className={styles.iconButton}
          onClick={onFullscreen}
          aria-label={isFullscreen ? "退出全屏编辑" : "全屏编辑"}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      )}
      {diffEnabled && onDeleteCurrentStep && (
        <button
          type="button"
          className={styles.iconButton}
          onClick={onDeleteCurrentStep}
          disabled={!canDeleteCurrentStep}
          aria-label="删除当前步骤"
        >
          <Trash2 size={16} />
        </button>
      )}
      {showStepNavigation && (
        <>
          <div className={styles.divider} />
          <button
            type="button"
            className={styles.iconButton}
            onClick={onPreviousStep}
            disabled={!hasPreviousStep}
            aria-label="上一步"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onNextStep}
            disabled={!hasNextStep}
            aria-label="下一步"
          >
            <ChevronRight size={16} />
          </button>
          <span className={styles.stepIndicator} aria-label="步骤进度">
            {`${currentStep}/${totalSteps}`}
          </span>
        </>
      )}
      <div className={styles.divider} />
      <button
        type="button"
        className={styles.iconButton}
        onClick={onCopy}
        aria-label="复制代码"
      >
        <Copy className={styles.copyIcon} size={16} />
      </button>
    </div>
  ),
);

ToolbarButtons.displayName = "ToolbarButtons";

export default ToolbarButtons;
