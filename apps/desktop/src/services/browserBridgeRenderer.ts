/**
 * 浏览器伴读的渲染端协作：主进程驱动扩展对话的宿主会话，但桌面工具（ToolRegistry、MCP）只有渲染端有。
 * 主进程建会话前经 `browser-bridge:tool-catalog` 要一份与桌面对话相同的工具清单（扩展被授予
 * 「使用 Tau 里的工具」时才要），执行时宿主经已有的 pi-tool-call 工具桥派给这里。
 *
 * 由主窗口的 BrowserCompanionHost 安装；没有主窗口时主进程只给扩展页面工具。
 */
import { on, send } from "@/electron";
import { getToolRegistryAgentTools } from "@/agent/toolRegistryAgentTools";
import type { PiHostToolSpec } from "@/types/pi-session";
import {
  initPiToolBridge,
  registerPiToolSessionContext,
  unregisterPiToolSessionContext,
} from "./piToolBridge";
import { getChatDatabase } from "./chatDatabase";
import useSkillStore from "@/stores/useSkillStore";
import { buildPiChatSystemPrompt } from "./piChatSession";

let installed = false;

/** 桌面工具清单：只给已启用的（扩展对话每轮新建会话，不需要全集 + 活跃子集） */
export const desktopToolCatalog = (
  tools = getToolRegistryAgentTools({ includeBuiltinSkillTools: true })
): PiHostToolSpec[] =>
  tools
    .map(tool => ({
      name: tool.name,
      executionIdentity: tool.executionIdentity,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
      risk: tool.risk ?? "execute",
      source: tool.source,
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

export function installBrowserBridgeRenderer(): void {
  if (installed) return;
  installed = true;
  initPiToolBridge();
  on("browser-bridge:tool-release", (_event: unknown, payload: { sessionId: string }) => {
    unregisterPiToolSessionContext(payload.sessionId);
  });
  on(
    "browser-bridge:tool-catalog",
    async (_event: unknown, payload: { requestId: string; sessionId: string }) => {
      const tools = getToolRegistryAgentTools({ includeBuiltinSkillTools: true });
      // 与桌面对话同一份 Skills 清单注入（只列清单，正文由 get_skill_readme 按需读取）
      await useSkillStore
        .getState()
        .loadSkills()
        .catch(() => undefined);
      const skillsPrompt = buildPiChatSystemPrompt("", useSkillStore.getState().skills, []).trim();
      registerPiToolSessionContext(payload.sessionId, {
        databaseName: getChatDatabase(),
        sessionTools: tools.map(tool => ({ ...tool, executor: tool.execute })),
      });
      send("browser-bridge:tool-catalog-result", {
        requestId: payload.requestId,
        tools: desktopToolCatalog(tools),
        skillsPrompt,
      });
    }
  );
}
