import React from "react";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
const data = vi.hoisted(() => ({
  props: null as any,
  live: [{ id: "live", role: "assistant", content: "正在流式生成" }],
}));
vi.mock("@tau/chat-ui", () => ({
  ChatContainerCore: (props: any) => {
    data.props = props;
    return null;
  },
}));
vi.mock("@tau/shared", () => ({ useChatAutoScroll: () => ({}) }));
vi.mock("antd", () => ({ App: { useApp: () => ({ message: {}, modal: {} }) } }));
vi.mock("../useAiChat", () => ({
  useAiChat: () => ({
    messages: data.live,
    isLoading: true,
    interactions: { approvals: [], questions: [] },
  }),
}));
vi.mock("../useChatSessions", () => ({
  useChatSessions: () => ({ sessions: [], currentSession: { id: "s" }, messages: [] }),
}));
vi.mock("../useLlmConfigs", () => ({ useLlmConfigs: () => ({ llmConfigs: [] }) }));
vi.mock("../useAiServerWebSocket", () => ({ useAiServerWebSocket: () => ({}) }));
vi.mock("../useSkills", () => ({ useSkills: () => ({ skills: [] }) }));
vi.mock("../useTheme", () => ({ useTheme: () => "light" }));
vi.mock("../../stores/useThemeStore", () => ({ useThemeStore: () => ({ themeMode: "light" }) }));
vi.mock("../../components/ChatMessage", () => ({ default: () => null }));
vi.mock("../../components/ToolApprovalBar", () => ({ default: () => null }));
vi.mock("../../components/ChatDropdownSelector", () => ({ default: () => null }));
import SharedChatTab from "../../entrypoints/sidepanel/components/tabs/SharedChatTab";
it("流式视图使用运行时消息，文件投影为空也能显示回答与提问卡", () => {
  renderToString(<SharedChatTab wsClient={null} url="https://example.com" />);
  expect(data.props.messages).toBe(data.live);
});
