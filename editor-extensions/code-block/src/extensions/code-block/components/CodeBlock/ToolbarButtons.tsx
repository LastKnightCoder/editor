import React from "react";
import { ChevronLeft, ChevronRight, Code2, Copy, Plus, Trash2 } from "lucide-react";

import { FloatingToolbar, ToolbarDivider, ToolbarIconButton } from "@tau/editor/api";

/** 代码块悬停 group 名：容器加它，工具条随悬停显隐（代码块不会嵌套代码块） */
export const CODE_HOVER_GROUP = "group/code";

interface ToolbarButtonsProps {
  onCopy: () => void;
  onDiffPrimaryAction?: () => void;
  onDeleteCurrentStep?: () => void;
  canDeleteCurrentStep?: boolean;
  diffEnabled?: boolean;
  onPreviousStep?: () => void;
  onNextStep?: () => void;
  hasPreviousStep?: boolean;
  hasNextStep?: boolean;
  showStepNavigation?: boolean;
  currentStep?: number;
  totalSteps?: number;
}

const ToolbarButtons = React.memo<ToolbarButtonsProps>(
  ({
    onCopy,
    onDiffPrimaryAction,
    onDeleteCurrentStep,
    canDeleteCurrentStep = false,
    diffEnabled = false,
    onPreviousStep,
    onNextStep,
    hasPreviousStep = false,
    hasNextStep = false,
    showStepNavigation = false,
    currentStep = 0,
    totalSteps = 0,
  }) => (
    <FloatingToolbar className="group-hover/code:pointer-events-auto group-hover/code:translate-y-0 group-hover/code:opacity-100">
      {onDiffPrimaryAction && (
        <ToolbarIconButton
          icon={diffEnabled ? Plus : Code2}
          title={diffEnabled ? "新增下一步" : "开启 Diff 动画"}
          onClick={onDiffPrimaryAction}
        />
      )}
      {diffEnabled && onDeleteCurrentStep && (
        <ToolbarIconButton
          icon={Trash2}
          title="删除当前步骤"
          tone="danger"
          onClick={onDeleteCurrentStep}
          disabled={!canDeleteCurrentStep}
        />
      )}
      {showStepNavigation && (
        <>
          <ToolbarDivider />
          <ToolbarIconButton
            icon={ChevronLeft}
            title="上一步"
            onClick={onPreviousStep}
            disabled={!hasPreviousStep}
          />
          <ToolbarIconButton
            icon={ChevronRight}
            title="下一步"
            onClick={onNextStep}
            disabled={!hasNextStep}
          />
          <span
            className="min-w-[3.4em] select-none px-[0.2em] text-center font-[family-name:var(--ed-font-mono)] text-[0.72em] leading-none text-[var(--ed-text-secondary)]"
            aria-label="步骤进度"
          >
            {`${currentStep}/${totalSteps}`}
          </span>
        </>
      )}
      {(onDiffPrimaryAction || showStepNavigation) && <ToolbarDivider />}
      <ToolbarIconButton icon={Copy} title="复制代码" onClick={onCopy} />
    </FloatingToolbar>
  )
);

ToolbarButtons.displayName = "ToolbarButtons";

export default ToolbarButtons;
