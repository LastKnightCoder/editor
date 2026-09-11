import { command } from "@tau/rpc";

/**
 * 应用设置读写契约。载荷为 JSON 字符串（与桌面版 setting.json 同构），
 * 保持中立：Electron 实现落主进程数据目录，Web Server 实现落服务端数据卷。
 */
export const settingCommands = {
  read: command<[], string>("read-setting"),
  write: command<[string], void>("write-setting"),
};
