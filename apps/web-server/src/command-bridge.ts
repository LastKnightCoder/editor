import { createCommandRegistry, setCommandBridge } from "@tau/rpc";

/**
 * web-server 侧命令契约装配：register 桥接到本进程的中立 registry，
 * 命令实现（src/commands/*）经契约 ref.register 写入，HTTP 端点从这里分发。
 */
export const commandRegistry = createCommandRegistry();

setCommandBridge({
  register: (channel, handler) => {
    commandRegistry.registerInvokeHandler(channel, handler);
  },
});
