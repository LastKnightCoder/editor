import { createCommandRegistry, setCommandBridge, type CommandBridge } from "@tau/rpc";

/**
 * web-server 侧命令契约装配：register 桥接到本进程的中立 registry，
 * 命令实现（src/commands/*）经契约 ref.register 写入，HTTP 端点从这里分发。
 */
export const commandRegistry = createCommandRegistry();

const bridge: CommandBridge = {
  register: function register<TArgs extends unknown[], TResult>(
    channel: string,
    handler: (event: import("@tau/rpc").CommandEvent, ...args: TArgs) => TResult | Promise<TResult>
  ) {
    commandRegistry.registerInvokeHandler(
      channel,
      (event, ...args) => handler(event, ...(args as TArgs)) as TResult | Promise<TResult>
    );
  },
};

setCommandBridge(bridge);
