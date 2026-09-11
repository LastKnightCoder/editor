import { create } from "zustand";
import {
  initModulesForWindow,
  initModule as initModuleCommand,
  getModuleInitStatus,
  type ModuleInitResult,
} from "@/commands";
import { on } from "@/electron";

export enum ModuleStatus {
  PENDING = "pending",
  INITIALIZING = "initializing",
  READY = "ready",
  ERROR = "error",
}

interface ModuleState {
  status: ModuleStatus;
  error?: string;
}

type InitResult = ModuleInitResult;

interface IState {
  /** 模块状态 */
  moduleStates: Record<string, ModuleState>;
  /** 是否正在初始化 */
  isInitializing: boolean;
  /** 当前初始化阶段 */
  initStage: "immediate" | "background" | "on-demand" | "done";
  /** 当前正在初始化的模块 */
  currentModule: string;
  /** 失败的模块 */
  failedModules: { name: string; error: string }[];
  /** BACKGROUND 层是否已就绪 */
  isBackgroundReady: boolean;
}

interface IActions {
  /** 初始化监听器 */
  initListeners: () => void;
  /** 为窗口类型初始化模块 */
  initForWindow: (windowType: string) => Promise<InitResult>;
  /** 初始化指定模块 */
  initModule: (moduleName: string) => Promise<{ success: boolean; error?: string }>;
  /** 检查模块是否就绪 */
  isModuleReady: (moduleName: string) => boolean;
  /** 检查多个模块是否都就绪 */
  areModulesReady: (moduleNames: string[]) => boolean;
  /** 获取模块状态 */
  refreshStatus: () => Promise<void>;
  /** 清除失败模块 */
  clearFailedModules: () => void;
  /** 设置初始化阶段 */
  setInitStage: (stage: IState["initStage"]) => void;
}

export const useModuleStore = create<IState & IActions>((set, get) => ({
  moduleStates: {},
  isInitializing: false,
  initStage: "immediate",
  currentModule: "",
  failedModules: [],
  isBackgroundReady: false,

  initListeners: () => {
    // 监听 BACKGROUND 层就绪通知
    on("module-init:background-ready", () => {
      set({ isBackgroundReady: true, initStage: "on-demand" });
    });
  },

  initForWindow: async (windowType: string) => {
    set({ isInitializing: true, initStage: "background", currentModule: "正在初始化..." });

    try {
      const result = await initModulesForWindow(windowType);

      // 更新模块状态
      await get().refreshStatus();

      if (!result.success) {
        set({
          failedModules: result.failedModules,
        });
      }

      set({
        isInitializing: false,
        initStage: "done",
        currentModule: "",
      });

      return result;
    } catch (error) {
      console.error("模块初始化失败:", error);
      set({
        isInitializing: false,
        initStage: "done",
        currentModule: "",
      });
      return {
        success: false,
        readyModules: [],
        failedModules: [{ name: "unknown", error: String(error) }],
      };
    }
  },

  initModule: async (moduleName: string) => {
    try {
      const result = await initModuleCommand(moduleName);
      await get().refreshStatus();
      return result;
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  isModuleReady: (moduleName: string) => {
    const { moduleStates } = get();
    return moduleStates[moduleName]?.status === ModuleStatus.READY;
  },

  areModulesReady: (moduleNames: string[]) => {
    const { isModuleReady } = get();
    return moduleNames.every(isModuleReady);
  },

  refreshStatus: async () => {
    try {
      const status = await getModuleInitStatus();
      set({ moduleStates: status as Record<string, ModuleState> });
    } catch (error) {
      console.error("获取模块状态失败:", error);
    }
  },

  clearFailedModules: () => {
    set({ failedModules: [] });
  },

  setInitStage: (stage: IState["initStage"]) => {
    set({ initStage: stage });
  },
}));
