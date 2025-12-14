/**
 * 模块初始化层级
 */
export enum InitLayer {
  /** 立即执行：窗口打开前必需，如 logger, setting */
  IMMEDIATE = 0,
  /** 后台执行：窗口显示后后台初始化，如 server, database */
  BACKGROUND = 1,
  /** 按需加载：根据窗口类型前端触发加载 */
  ON_DEMAND = 2,
}

/**
 * 模块分组
 */
export enum ModuleGroup {
  /** 必要模块（所有窗口都需要） */
  ESSENTIAL = "essential",
  /** 核心模块 */
  CORE = "core",
  /** 数据库相关 */
  DATABASE = "database",
  /** 服务器相关 */
  SERVER = "server",
  /** 渲染相关 */
  RENDER = "render",
  /** 缓存模块 */
  CACHE = "cache",
  /** 云存储模块 */
  CLOUD = "cloud",
  /** AI 模块 */
  AI = "ai",
  /** 集成模块 */
  INTEGRATION = "integration",
  /** 功能模块 */
  FEATURE = "feature",
}

/**
 * 模块状态
 */
export enum ModuleStatus {
  /** 等待初始化 */
  PENDING = "pending",
  /** 正在初始化 */
  INITIALIZING = "initializing",
  /** 已就绪 */
  READY = "ready",
  /** 初始化失败 */
  ERROR = "error",
}

/**
 * 模块配置
 */
export interface ModuleConfig {
  /** 模块名称 */
  name: string;
  /** 模块分组 */
  group: ModuleGroup;
  /** 初始化层级 */
  layer: InitLayer;
  /** 依赖的模块名称列表 */
  dependencies?: string[];
  /** 初始化函数 */
  init: () => Promise<void>;
}

/**
 * 模块状态信息
 */
export interface ModuleState {
  /** 当前状态 */
  status: ModuleStatus;
  /** 错误信息（当 status 为 ERROR 时） */
  error?: string;
  /** 开始初始化时间 */
  startTime?: number;
  /** 初始化完成时间 */
  endTime?: number;
}

/**
 * 初始化结果
 */
export interface InitResult {
  /** 是否全部成功 */
  success: boolean;
  /** 已就绪的模块 */
  readyModules: string[];
  /** 失败的模块 */
  failedModules: { name: string; error: string }[];
}
