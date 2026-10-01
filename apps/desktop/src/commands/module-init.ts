import { invoke } from "@/electron";

/** 确保启动模块初始化完成，失败后可重试 */
const initModule = async (moduleName: string): Promise<{ success: boolean; error?: string }> => {
  return invoke("module-init:init-module", moduleName);
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
