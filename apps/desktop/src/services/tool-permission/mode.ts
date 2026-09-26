/**
 * 通用工具权限模式（D-060）：工具声明风险级别，全局模式决定哪些级别执行前要用户确认。
 * 纯函数层，不依赖 store，便于 agent 策略、设置页与测试共用。
 */

import type { ToolRisk } from "@/types/tool";

export type ToolPermissionMode = "manual" | "acceptEdits" | "bypass";

export const DEFAULT_TOOL_PERMISSION_MODE: ToolPermissionMode = "manual";

export const TOOL_PERMISSION_MODES: Array<{
  value: ToolPermissionMode;
  label: string;
  short: string;
  description: string;
}> = [
  {
    value: "manual",
    label: "手动确认",
    short: "手动确认",
    description: "修改内容、执行脚本前都先问你",
  },
  {
    value: "acceptEdits",
    label: "自动允许编辑",
    short: "自动编辑",
    description: "修改内容直接生效，执行脚本仍要确认",
  },
  {
    value: "bypass",
    label: "跳过确认",
    short: "跳过确认",
    description: "所有工具直接执行，不再询问（Bypass）",
  },
];

export const normalizePermissionMode = (value: unknown): ToolPermissionMode =>
  value === "acceptEdits" || value === "bypass" || value === "manual"
    ? value
    : DEFAULT_TOOL_PERMISSION_MODE;

/** 该风险级别在当前模式下是否需要用户确认 */
export const requiresApproval = (risk: ToolRisk | undefined, mode: ToolPermissionMode): boolean => {
  if (!risk || risk === "read" || mode === "bypass") return false;
  if (risk === "write") return mode === "manual";
  return true;
};

export const RISK_LABEL: Record<ToolRisk, string> = {
  read: "只读",
  write: "修改内容",
  execute: "执行代码",
};
