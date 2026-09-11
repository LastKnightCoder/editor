/**
 * 渲染侧命令契约装配：call 桥接到 HTTP RPC 管道。
 * 必须在 main.tsx 的最早同步区 import，确保早于任何 command 调用。
 */
import { setCommandBridge } from "@tau/rpc";
import { httpInvoke } from "@/rpc/http-invoke";

setCommandBridge({
  call: (channel, args) => httpInvoke(channel, args),
});
