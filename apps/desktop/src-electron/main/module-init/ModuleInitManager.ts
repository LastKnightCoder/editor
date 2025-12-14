import { ipcMain, BrowserWindow } from "electron";
import log from "electron-log";
import {
  ModuleConfig,
  ModuleState,
  ModuleStatus,
  InitLayer,
  InitResult,
} from "./types";
import { MODULE_CONFIGS, WEBSOCKET_DEPENDENT_MODULES } from "./module-config";
import { WindowType, getRequiredModulesForWindow } from "./window-module-mapping";
import BackendWebSocketServer from "../utils/BackendWebSocketServer";

// 需要动态导入的 WebSocket 依赖模块
import userSettingModule from "../modules/user-setting";
import pomodoroModule from "../modules/pomodoro";
import webClipModule from "../modules/web-clip";
import resourceSyncModule from "../modules/resource-sync";
import publishModule from "../modules/publish";

type InitCallback = (success: boolean, error?: string) => void;

/**
 * 模块初始化管理器
 * 负责管理所有模块的初始化状态、依赖关系和防重复初始化
 */
class ModuleInitManager {
  private static instance: ModuleInitManager;

  /** 模块状态映射 */
  private moduleStates: Map<string, ModuleState> = new Map();

  /** 模块配置映射（方便查找） */
  private moduleConfigs: Map<string, ModuleConfig> = new Map();

  /** 正在初始化的模块（防止重复初始化） */
  private initializingModules: Set<string> = new Set();

  /** 初始化完成回调 */
  private initCallbacks: Map<string, InitCallback[]> = new Map();

  /** BackendWebSocketServer 实例 */
  private backendServer: BackendWebSocketServer | null = null;

  /** 是否已完成 Layer1 初始化 */
  private layer1Completed = false;

  private constructor() {
    // 初始化模块配置映射和状态
    MODULE_CONFIGS.forEach((config) => {
      this.moduleConfigs.set(config.name, config);
      this.moduleStates.set(config.name, { status: ModuleStatus.PENDING });
    });

    // WebSocket 依赖模块也需要添加状态
    WEBSOCKET_DEPENDENT_MODULES.forEach((name) => {
      this.moduleStates.set(name, { status: ModuleStatus.PENDING });
    });

    this.registerIpcHandlers();
  }

  static getInstance(): ModuleInitManager {
    if (!ModuleInitManager.instance) {
      ModuleInitManager.instance = new ModuleInitManager();
    }
    return ModuleInitManager.instance;
  }

  /**
   * 注册 IPC 处理器
   */
  private registerIpcHandlers() {
    // 获取所有模块状态
    ipcMain.handle("module-init:get-status", () => {
      return this.getAllModuleStates();
    });

    // 获取指定模块状态
    ipcMain.handle("module-init:get-module-status", (_, moduleName: string) => {
      return this.getModuleState(moduleName);
    });

    // 为窗口类型初始化模块
    ipcMain.handle(
      "module-init:init-for-window",
      async (_, windowType: WindowType) => {
        return this.initModulesForWindow(windowType);
      },
    );

    // 初始化指定模块
    ipcMain.handle("module-init:init-module", async (_, moduleName: string) => {
      return this.initModule(moduleName);
    });

    // 初始化多个模块
    ipcMain.handle(
      "module-init:init-modules",
      async (_, moduleNames: string[]) => {
        return this.initModules(moduleNames);
      },
    );

    // 检查 Layer1 是否完成
    ipcMain.handle("module-init:is-layer1-ready", () => {
      return this.layer1Completed;
    });
  }

  /**
   * 获取所有模块状态
   */
  getAllModuleStates(): Record<string, ModuleState> {
    const result: Record<string, ModuleState> = {};
    this.moduleStates.forEach((state, name) => {
      result[name] = { ...state };
    });
    return result;
  }

  /**
   * 获取指定模块状态
   */
  getModuleState(moduleName: string): ModuleState | null {
    return this.moduleStates.get(moduleName) || null;
  }

  /**
   * 检查模块是否已就绪
   */
  isModuleReady(moduleName: string): boolean {
    const state = this.moduleStates.get(moduleName);
    return state?.status === ModuleStatus.READY;
  }

  /**
   * 设置 BackendWebSocketServer
   */
  setBackendServer(server: BackendWebSocketServer) {
    this.backendServer = server;
  }

  /**
   * 初始化 IMMEDIATE 层模块（同步，窗口创建前）
   */
  async initImmediate(): Promise<void> {
    const immediateModules = MODULE_CONFIGS.filter(
      (c) => c.layer === InitLayer.IMMEDIATE,
    );
    log.info(
      `[ModuleInitManager] 开始初始化 IMMEDIATE 层模块，共 ${immediateModules.length} 个`,
    );

    const startTime = Date.now();

    // 按依赖顺序初始化
    for (const config of this.sortByDependencies(immediateModules)) {
      await this.initModuleInternal(config);
    }

    log.info(
      `[ModuleInitManager] IMMEDIATE 层模块初始化完成，耗时: ${Date.now() - startTime}ms`,
    );
  }

  /**
   * 初始化 BACKGROUND 层模块（后台，窗口创建后）
   */
  async initBackground(): Promise<void> {
    const backgroundModules = MODULE_CONFIGS.filter(
      (c) => c.layer === InitLayer.BACKGROUND,
    );
    log.info(
      `[ModuleInitManager] 开始初始化 BACKGROUND 层模块，共 ${backgroundModules.length} 个`,
    );

    const startTime = Date.now();

    // 按依赖顺序初始化
    const sorted = this.sortByDependencies(backgroundModules);
    await Promise.allSettled(
      sorted.map((config) => this.initModuleInternal(config)),
    );

    this.layer1Completed = true;

    // 通知所有窗口 BACKGROUND 层已完成
    this.notifyAllWindows("module-init:background-ready", null);

    log.info(
      `[ModuleInitManager] BACKGROUND 层模块初始化完成，耗时: ${Date.now() - startTime}ms`,
    );
  }

  /**
   * 初始化 WebSocket 依赖的模块
   */
  async initWebSocketDependentModules(): Promise<void> {
    if (!this.backendServer) {
      log.warn(
        "[ModuleInitManager] BackendWebSocketServer 未设置，跳过 WebSocket 依赖模块",
      );
      return;
    }

    log.info("[ModuleInitManager] 初始化 WebSocket 依赖模块");
    const startTime = Date.now();

    try {
      // 设置 publish 模块的 backendServer
      publishModule.setBackendServer(this.backendServer);
      this.updateModuleState("publish", {
        status: ModuleStatus.READY,
        endTime: Date.now(),
      });

      // 初始化其他 WebSocket 依赖模块
      await userSettingModule.init(this.backendServer);
      this.updateModuleState("user-setting", {
        status: ModuleStatus.READY,
        endTime: Date.now(),
      });

      await pomodoroModule.init(this.backendServer);
      this.updateModuleState("pomodoro", {
        status: ModuleStatus.READY,
        endTime: Date.now(),
      });

      await webClipModule.init(this.backendServer);
      this.updateModuleState("web-clip", {
        status: ModuleStatus.READY,
        endTime: Date.now(),
      });

      await resourceSyncModule.init(this.backendServer);
      this.updateModuleState("resource-sync", {
        status: ModuleStatus.READY,
        endTime: Date.now(),
      });

      log.info(
        `[ModuleInitManager] WebSocket 依赖模块初始化完成，耗时: ${Date.now() - startTime}ms`,
      );
    } catch (error) {
      log.error("[ModuleInitManager] WebSocket 依赖模块初始化失败:", error);
    }
  }

  /**
   * 为特定窗口类型初始化模块
   */
  async initModulesForWindow(windowType: WindowType): Promise<InitResult> {
    const requiredModules = getRequiredModulesForWindow(windowType);
    log.info(
      `[ModuleInitManager] 为窗口类型 ${windowType} 初始化模块，需要: ${requiredModules.join(", ")}`,
    );

    return this.initModules(requiredModules);
  }

  /**
   * 初始化多个模块
   */
  async initModules(moduleNames: string[]): Promise<InitResult> {
    const readyModules: string[] = [];
    const failedModules: { name: string; error: string }[] = [];

    // 过滤掉已就绪的模块
    const modulesToInit = moduleNames.filter((name) => !this.isModuleReady(name));

    // 如果所有模块都已就绪
    if (modulesToInit.length === 0) {
      return {
        success: true,
        readyModules: moduleNames,
        failedModules: [],
      };
    }

    // 获取配置并按依赖排序
    const configs = modulesToInit
      .map((name) => this.moduleConfigs.get(name))
      .filter((c): c is ModuleConfig => c !== undefined);

    const sorted = this.sortByDependencies(configs);

    // 初始化
    for (const config of sorted) {
      const result = await this.initModuleInternal(config);
      if (result.success) {
        readyModules.push(config.name);
      } else {
        failedModules.push({
          name: config.name,
          error: result.error || "未知错误",
        });
      }
    }

    // 添加已经就绪的模块
    moduleNames.forEach((name) => {
      if (this.isModuleReady(name) && !readyModules.includes(name)) {
        readyModules.push(name);
      }
    });

    return {
      success: failedModules.length === 0,
      readyModules,
      failedModules,
    };
  }

  /**
   * 初始化单个模块
   */
  async initModule(
    moduleName: string,
  ): Promise<{ success: boolean; error?: string }> {
    const config = this.moduleConfigs.get(moduleName);
    if (!config) {
      return { success: false, error: `模块 ${moduleName} 不存在` };
    }

    return this.initModuleInternal(config);
  }

  /**
   * 内部初始化方法
   */
  private async initModuleInternal(
    config: ModuleConfig,
  ): Promise<{ success: boolean; error?: string }> {
    const { name } = config;

    // 检查是否已就绪
    if (this.isModuleReady(name)) {
      return { success: true };
    }

    // 检查是否正在初始化（防止重复）
    if (this.initializingModules.has(name)) {
      // 等待初始化完成
      return new Promise((resolve) => {
        const callbacks = this.initCallbacks.get(name) || [];
        callbacks.push((success, error) => resolve({ success, error }));
        this.initCallbacks.set(name, callbacks);
      });
    }

    // 标记为正在初始化
    this.initializingModules.add(name);
    this.updateModuleState(name, {
      status: ModuleStatus.INITIALIZING,
      startTime: Date.now(),
    });

    try {
      // 先初始化依赖
      if (config.dependencies) {
        for (const dep of config.dependencies) {
          if (!this.isModuleReady(dep)) {
            const depConfig = this.moduleConfigs.get(dep);
            if (depConfig) {
              const depResult = await this.initModuleInternal(depConfig);
              if (!depResult.success) {
                throw new Error(
                  `依赖模块 ${dep} 初始化失败: ${depResult.error}`,
                );
              }
            }
          }
        }
      }

      // 初始化模块
      log.info(`[ModuleInitManager] 初始化模块: ${name}`);
      await config.init();

      // 更新状态
      this.updateModuleState(name, {
        status: ModuleStatus.READY,
        endTime: Date.now(),
      });

      log.info(`[ModuleInitManager] 模块 ${name} 初始化完成`);

      // 触发回调
      this.notifyCallbacks(name, true);

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log.error(`[ModuleInitManager] 模块 ${name} 初始化失败:`, error);

      this.updateModuleState(name, {
        status: ModuleStatus.ERROR,
        error: errorMessage,
        endTime: Date.now(),
      });

      // 触发回调
      this.notifyCallbacks(name, false, errorMessage);

      return { success: false, error: errorMessage };
    } finally {
      this.initializingModules.delete(name);
    }
  }

  /**
   * 更新模块状态
   */
  private updateModuleState(name: string, partialState: Partial<ModuleState>) {
    const currentState = this.moduleStates.get(name) || {
      status: ModuleStatus.PENDING,
    };
    this.moduleStates.set(name, { ...currentState, ...partialState });
  }

  /**
   * 通知等待的回调
   */
  private notifyCallbacks(name: string, success: boolean, error?: string) {
    const callbacks = this.initCallbacks.get(name) || [];
    callbacks.forEach((cb) => cb(success, error));
    this.initCallbacks.delete(name);
  }

  /**
   * 通知所有窗口
   */
  private notifyAllWindows(channel: string, data: unknown) {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }

  /**
   * 按依赖排序（拓扑排序）
   */
  private sortByDependencies(configs: ModuleConfig[]): ModuleConfig[] {
    const sorted: ModuleConfig[] = [];
    const visited = new Set<string>();
    const configMap = new Map(configs.map((c) => [c.name, c]));

    const visit = (config: ModuleConfig) => {
      if (visited.has(config.name)) return;
      visited.add(config.name);

      // 先访问依赖
      if (config.dependencies) {
        for (const dep of config.dependencies) {
          const depConfig = configMap.get(dep);
          if (depConfig) {
            visit(depConfig);
          }
        }
      }

      sorted.push(config);
    };

    configs.forEach(visit);
    return sorted;
  }
}

export default ModuleInitManager.getInstance();
