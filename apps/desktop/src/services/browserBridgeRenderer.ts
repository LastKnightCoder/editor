/**
 * 浏览器扩展桥的渲染端协作（M5）：主进程直接驱动扩展对话的宿主会话，但桌面工具（ToolRegistry、MCP）
 * 只有渲染端有。主进程建会话前经 `browser-bridge:tool-catalog` 向主窗口要一份工具清单
 * （风险、来源与桌面聊天同一口径），执行时宿主经已有的 pi-tool-call 工具桥派给这里。
 *
 * 由主窗口挂载（与 aiServer 同一时机）；没有主窗口时主进程只给扩展页面工具。
 */
import { on, send } from "@/electron";
import { getToolRegistryAgentTools } from "@/agent/toolRegistryAgentTools";
import type { PiHostToolSpec } from "@/types/pi-session";
import { initPiToolBridge } from "./piToolBridge";

let installed = false;

/** 桌面工具清单：只给已启用的（扩展对话每轮新建会话，不需要全集 + 活跃子集） */
export const desktopToolCatalog = (): PiHostToolSpec[] =>
  getToolRegistryAgentTools({ includeBuiltinSkillTools: true })
    .map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
      risk: tool.risk ?? "read",
      source: tool.source,
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

export function installBrowserBridgeRenderer(): void {
  if (installed) return;
  installed = true;
  initPiToolBridge();
  on("browser-bridge:tool-catalog", (_event: unknown, payload: { requestId: string }) => {
    send("browser-bridge:tool-catalog-result", {
      requestId: payload.requestId,
      tools: desktopToolCatalog(),
    });
  });
}
