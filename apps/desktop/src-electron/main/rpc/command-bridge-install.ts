import { ipcMain } from "electron";
import { setCommandBridge, type CommandHandler } from "@tau/rpc";
import { recordIpcCall } from "../modules/perf-monitor";

// 必须作为主入口的第一个 import 执行：使用 command().register 的模块（如
// modules/setting.ts）依赖契约桥先就位，调用最终落到原生 ipcMain.handle。
// 泛型 TArgs 在此回调上下文无法具体化，把 handler 收敛为默认泛型签名再调用
setCommandBridge({
  register: (channel, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
      const startedAt = Date.now();
      try {
        const result = await (handler as CommandHandler)(event, ...args);
        recordIpcCall(channel, Date.now() - startedAt, true);
        return result;
      } catch (error) {
        recordIpcCall(channel, Date.now() - startedAt, false);
        throw error;
      }
    });
  },
});
