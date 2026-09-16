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

/**
 * 模块就绪任务缓存 —— 主进程各模块 init 无防重入（重复注册 handler 会抛
 * "Attempted to register a second handler"），防重入只做在 ModuleInitManager 里，
 * 故并发去重必须放在调用侧。
 */
const readyTasks = new Map<string, Promise<void>>();

/** 确保模块就绪；并发调用共用同一任务，失败不缓存以便重试 */
export async function ensureModule(moduleName: string): Promise<void> {
  const pending = readyTasks.get(moduleName);
  if (pending) return pending;

  const task = initModule(moduleName)
    .then(result => {
      if (!result?.success) {
        throw new Error(result?.error || `初始化模块 ${moduleName} 失败`);
      }
    })
    .catch((error: unknown) => {
      readyTasks.delete(moduleName);
      throw error;
    });

  readyTasks.set(moduleName, task);
  return task;
}

/** 命令前置：先确保模块就绪再执行，避免 "No handler registered" */
export async function withModule<T>(moduleName: string, run: () => Promise<T>): Promise<T> {
  await ensureModule(moduleName);
  return run();
}
