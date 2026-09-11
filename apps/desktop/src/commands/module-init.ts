import { invoke } from "@/electron";

export interface ModuleInitResult {
  success: boolean;
  readyModules: string[];
  failedModules: { name: string; error: string }[];
}

export type ModuleStatus = "pending" | "initializing" | "ready" | "error";

export interface ModuleState {
  status: ModuleStatus;
  error?: string;
}

/** 按窗口类型初始化其所需的模块集合 */
export const initModulesForWindow = async (windowType: string): Promise<ModuleInitResult> => {
  return invoke("module-init:init-for-window", windowType);
};

/** 按需初始化单个模块 */
export const initModule = async (
  moduleName: string
): Promise<{ success: boolean; error?: string }> => {
  return invoke("module-init:init-module", moduleName);
};

/** 查询全部模块的初始化状态 */
export const getModuleInitStatus = async (): Promise<Record<string, ModuleState>> => {
  return invoke("module-init:get-status");
};
