import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import log from "electron-log";

// 日志配置
export function setupLogger() {
  // 配置日志目录
  const userHome = os.homedir();
  const logDir = path.join(userHome, ".editor");

  // 确保日志目录存在
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // 配置 electron-log
  log.initialize({ preload: true });
  log.transports.file.level = "info";
  log.transports.console.level = "debug";
  log.transports.file.resolvePathFn = () => path.join(logDir, "notes.log");

  log.info("日志系统初始化，日志路径：", path.join(logDir, "notes.log"));

  return { logDir };
}

export default {
  init: async () => {
    return setupLogger();
  },
};
