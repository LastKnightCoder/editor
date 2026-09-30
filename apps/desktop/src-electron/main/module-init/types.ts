/**
 * 模块初始化层级
 */
export enum InitLayer {
  /** 立即执行：窗口打开前必需，如 logger, setting */
  IMMEDIATE = 0,
  /** 后台执行：窗口显示后后台初始化，如 server, database */
  BACKGROUND = 1,
}

/**
 * 模块配置
 */
export interface ModuleConfig {
  /** 模块名称 */
  name: string;
  /** 初始化层级 */
  layer: InitLayer;
  /** 依赖的模块名称列表 */
  dependencies?: string[];
  /** 初始化函数 */
  init: () => Promise<void>;
}
