import { memo } from "react";
import classNames from "classnames";

import ResourceSelector from "./ResourceSelector";
import type { VLResource } from "@/types/vibe-learning";

interface GenerationConfigStepProps {
  /** 资源列表 */
  resources: VLResource[];
  /** 选中的资源 ID 列表 */
  selectedResourceIds: number[];
  /** 是否正在加载资源 */
  loading: boolean;
  /** 是否全部选中 */
  isAllSelected: boolean;
  /** 切换单个资源的选择状态 */
  onToggleResource: (resourceId: number) => void;
  /** 全选/取消全选 */
  onToggleAll: () => void;
  /** 加载资源列表 */
  onLoadResources?: () => void;
  /** 用户提示 */
  userPrompt: string;
  /** 设置用户提示 */
  onUserPromptChange: (value: string) => void;
  /** 提示输入框占位符 */
  promptPlaceholder?: string;
  /** 提示输入框标题 */
  promptTitle?: string;
  /** 资源选择器标题 */
  resourceTitle?: string;
  /** 资源为空时的提示文案 */
  emptyResourceText?: string;
}

/**
 * 生成配置步骤组件
 * 组合资源选择和额外提示输入
 */
const GenerationConfigStep = memo((props: GenerationConfigStepProps) => {
  const {
    resources,
    selectedResourceIds,
    loading,
    isAllSelected,
    onToggleResource,
    onToggleAll,
    onLoadResources,
    userPrompt,
    onUserPromptChange,
    promptPlaceholder = "例如：重点关注 XXX 概念...",
    promptTitle = "额外要求（可选）",
    resourceTitle = "选择资源",
    emptyResourceText = "暂无可用资源",
  } = props;

  return (
    <div className="space-y-5">
      {/* 资源选择器 */}
      <ResourceSelector
        resources={resources}
        selectedResourceIds={selectedResourceIds}
        loading={loading}
        isAllSelected={isAllSelected}
        onToggleResource={onToggleResource}
        onToggleAll={onToggleAll}
        onLoad={onLoadResources}
        title={resourceTitle}
        emptyText={emptyResourceText}
      />

      {/* 额外提示输入 */}
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 block mb-2">
          {promptTitle}
        </label>
        <textarea
          value={userPrompt}
          onChange={(e) => onUserPromptChange(e.target.value)}
          placeholder={promptPlaceholder}
          rows={3}
          className={classNames(
            "w-full px-4 py-3 rounded-xl text-sm outline-none transition-all resize-none",
            "bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700",
            "text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500",
            "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
          )}
        />
      </div>
    </div>
  );
});

GenerationConfigStep.displayName = "GenerationConfigStep";

export default GenerationConfigStep;
