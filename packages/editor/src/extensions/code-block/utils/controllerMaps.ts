import type { CodeBlockController } from "../types";

/** 已挂载代码块编辑器的运行时注册表（按块 uuid），供命令与菜单读取 */
export const codeBlockMap = new Map<string, CodeBlockController>();

/** Diff 动画步骤条的运行时状态（按块 uuid），菜单打开时读取快照 */
export const codeBlockActionsMap = new Map<
  string,
  {
    goToPreviousStep: () => void;
    goToNextStep: () => void;
    hasPreviousStep: boolean;
    hasNextStep: boolean;
  }
>();
