/**
 * 把权限模式接到 @tau/agent 的授权钩子上。
 * interactive = 调用方能在对话里渲染确认条（ChatContainer）；否则需要确认的工具直接拒绝，
 * 避免在没有界面的入口（浏览器扩展桥、子代理、一次性生成）里无限挂起。
 */

import type { AgentPolicies } from "@tau/agent";
import useSettingStore from "@/stores/useSettingStore";
import { isSessionAllowed, requestToolApproval } from "./approvalStore";
import { normalizePermissionMode, requiresApproval, type ToolPermissionMode } from "./mode";

const CONTENT_EDIT_SOURCE = "content-edit-tools";

export const getToolPermissionMode = (): ToolPermissionMode =>
  normalizePermissionMode(useSettingStore.getState().setting.agentPermission?.mode);

export const createToolPermissionPolicies = (options: {
  interactive: boolean;
}): Pick<AgentPolicies, "shouldAuthorizeToolCall" | "authorizeToolCall"> => ({
  shouldAuthorizeToolCall: ({ tool, conversationKey }) => {
    // 内容编辑工具自带「确认应用 / 拒绝」审阅卡，权限模式在其内部生效，不再二次确认
    if (!tool || tool.source === CONTENT_EDIT_SOURCE) return false;
    return (
      requiresApproval(tool.risk, getToolPermissionMode()) &&
      !isSessionAllowed(conversationKey, tool.name)
    );
  },
  authorizeToolCall: async ({ tool, call, conversationKey, signal }) => {
    if (!options.interactive) {
      return {
        approved: false,
        reason: "当前入口无法向用户确认；如需自动执行，请在设置里把工具权限切到「跳过确认」",
      };
    }
    return requestToolApproval(
      {
        toolCallId: call.id,
        toolName: call.function.name,
        risk: tool?.risk ?? "execute",
        input: call.function.arguments || "",
        conversationKey,
      },
      signal
    );
  },
});
