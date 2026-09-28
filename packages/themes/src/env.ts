/** 开发态判断：Vite 下读 import.meta.env.DEV；Node（vite 配置、主进程、测试）中没有 env 视为非开发态 */
export const isDev = (): boolean => Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
