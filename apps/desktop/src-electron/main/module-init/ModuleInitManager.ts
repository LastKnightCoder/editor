import { ipcMain } from "electron";
import log from "electron-log";
import { ModuleConfig, InitLayer } from "./types";
import { MODULE_CONFIGS } from "./module-config";
import type BackendWebSocketServer from "../utils/BackendWebSocketServer";

// 需要注入 WebSocket 服务的模块
import userSettingModule from "../modules/user-setting";
import pomodoroModule from "../modules/pomodoro";
import resourceSyncModule from "../modules/resource-sync";
import publishModule from "../modules/publish";

type InitCallback = (success: boolean, error?: string) => void;

/**
 * 模块初始化管理器
 * 负责模块就绪、依赖关系和防重复初始化
 */
class ModuleInitManager {
  private static instance: ModuleInitManager;

  /** 已完成初始化的模块 */
  private readyModules: Set<string> = new Set();

  /** 模块配置映射（方便查找） */
  private moduleConfigs: Map<string, ModuleConfig> = new Map();

  /** 正在初始化的模块（防止重复初始化） */
  private initializingModules: Set<string> = new Set();

  /** 初始化完成回调 */
  private initCallbacks: Map<string, InitCallback[]> = new Map();

  /** BackendWebSocketServer 实例 */
  private backendServer: BackendWebSocketServer | null = null;

  private constructor() {
    // 初始化模块配置映射
    MODULE_CONFIGS.forEach(config => {
      this.moduleConfigs.set(config.name, config);
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
    // 初始化指定模块
    ipcMain.handle("module-init:init-module", async (_, moduleName: string) => {
      return this.initModule(moduleName);
    });
  }

  /**
   * 检查模块是否已就绪
   */
  isModuleReady(moduleName: string): boolean {
    return this.readyModules.has(moduleName);
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
    const immediateModules = MODULE_CONFIGS.filter(c => c.layer === InitLayer.IMMEDIATE);
    log.info(`[ModuleInitManager] 开始初始化 IMMEDIATE 层模块，共 ${immediateModules.length} 个`);

    const startTime = Date.now();

    // 按依赖顺序初始化
    for (const config of this.sortByDependencies(immediateModules)) {
      await this.initModuleInternal(config);
    }

    log.info(`[ModuleInitManager] IMMEDIATE 层模块初始化完成，耗时: ${Date.now() - startTime}ms`);
  }

  /**
   * 初始化 BACKGROUND 层模块（后台，窗口创建后）
   */
  async initBackground(): Promise<void> {
    const backgroundModules = MODULE_CONFIGS.filter(c => c.layer === InitLayer.BACKGROUND);
    log.info(`[ModuleInitManager] 开始初始化 BACKGROUND 层模块，共 ${backgroundModules.length} 个`);

    const startTime = Date.now();

    // 按依赖顺序初始化
    const sorted = this.sortByDependencies(backgroundModules);
    await Promise.allSettled(sorted.map(config => this.initModuleInternal(config)));

    log.info(`[ModuleInitManager] BACKGROUND 层模块初始化完成，耗时: ${Date.now() - startTime}ms`);
  }

  /**
   * 初始化 WebSocket 依赖的模块
   */
  async initWebSocketDependentModules(): Promise<void> {
    if (!this.backendServer) {
      log.warn("[ModuleInitManager] BackendWebSocketServer 未设置，跳过 WebSocket 依赖模块");
      return;
    }

    log.info("[ModuleInitManager] 初始化 WebSocket 依赖模块");
    const startTime = Date.now();

    try {
      // publish 已随 BACKGROUND 层初始化，这里只补 WebSocket 依赖注入：走 initModule
      // 复用「已就绪即跳过」判断，直接 init 会二次注册 handler（防重入只在管理器层）
      await this.initModule("publish");
      publishModule.setBackendServer(this.backendServer);

      // 初始化其他 WebSocket 依赖模块
      await userSettingModule.init(this.backendServer);
      await pomodoroModule.init(this.backendServer);
      await resourceSyncModule.init(this.backendServer);

      log.info(
        `[ModuleInitManager] WebSocket 依赖模块初始化完成，耗时: ${Date.now() - startTime}ms`
      );
    } catch (error) {
      log.error("[ModuleInitManager] WebSocket 依赖模块初始化失败:", error);
    }
  }

  /**
   * 初始化单个模块
   */
  async initModule(moduleName: string): Promise<{ success: boolean; error?: string }> {
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
    config: ModuleConfig
  ): Promise<{ success: boolean; error?: string }> {
    const { name } = config;

    // 检查是否已就绪
    if (this.isModuleReady(name)) {
      return { success: true };
    }

    // 检查是否正在初始化（防止重复）
    if (this.initializingModules.has(name)) {
      // 等待初始化完成
      return new Promise(resolve => {
        const callbacks = this.initCallbacks.get(name) || [];
        callbacks.push((success, error) => resolve({ success, error }));
        this.initCallbacks.set(name, callbacks);
      });
    }

    // 标记为正在初始化
    this.initializingModules.add(name);

    try {
      // 先初始化依赖
      if (config.dependencies) {
        for (const dep of config.dependencies) {
          if (!this.isModuleReady(dep)) {
            const depConfig = this.moduleConfigs.get(dep);
            if (depConfig) {
              const depResult = await this.initModuleInternal(depConfig);
              if (!depResult.success) {
                throw new Error(`依赖模块 ${dep} 初始化失败: ${depResult.error}`);
              }
            }
          }
        }
      }

      // 初始化模块
      log.info(`[ModuleInitManager] 初始化模块: ${name}`);
      await config.init();

      // 更新状态
      this.readyModules.add(name);

      log.info(`[ModuleInitManager] 模块 ${name} 初始化完成`);

      // 触发回调
      this.notifyCallbacks(name, true);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`[ModuleInitManager] 模块 ${name} 初始化失败:`, error);

      // 触发回调
      this.notifyCallbacks(name, false, errorMessage);

      return { success: false, error: errorMessage };
    } finally {
      this.initializingModules.delete(name);
    }
  }

  /**
   * 通知等待的回调
   */
  private notifyCallbacks(name: string, success: boolean, error?: string) {
    const callbacks = this.initCallbacks.get(name) || [];
    callbacks.forEach(cb => cb(success, error));
    this.initCallbacks.delete(name);
  }

  /**
   * 按依赖排序（拓扑排序）
   */
  private sortByDependencies(configs: ModuleConfig[]): ModuleConfig[] {
    const sorted: ModuleConfig[] = [];
    const visited = new Set<string>();
    const configMap = new Map(configs.map(c => [c.name, c]));

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
