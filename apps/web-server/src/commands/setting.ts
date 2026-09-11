import fs from "node:fs/promises";
import { join } from "node:path";
import { settingCommands } from "@tau/contracts";
import type { WebServerConfig } from "../config";

/**
 * setting 契约的 Web 实现：与桌面版主进程共用同一份契约
 * （@tau/contracts），实现落点从 ~/.editor/setting.json 换为服务端数据卷，
 * 渲染层调用代码零改动——「同契约双实现」的首个示范。
 */
export function registerSettingCommands(config: WebServerConfig): void {
  const settingPath = () => join(config.dataDir, "setting.json");

  settingCommands.read.register(async () => {
    try {
      return await fs.readFile(settingPath(), "utf-8");
    } catch {
      // 首读不存在时与桌面版行为对齐：落一个空对象再返回
      await fs.mkdir(config.dataDir, { recursive: true });
      const initial = "{}";
      await fs.writeFile(settingPath(), initial, "utf-8");
      return initial;
    }
  });

  settingCommands.write.register(async (_event, setting) => {
    await fs.mkdir(config.dataDir, { recursive: true });
    // 临时文件 + 原子改名，避免写一半被读到（与桌面版策略一致）
    const tempPath = `${settingPath()}.tmp`;
    await fs.writeFile(tempPath, setting, "utf-8");
    await fs.rename(tempPath, settingPath());
  });
}
