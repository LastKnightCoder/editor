import { defineAssistView } from "@/app/assistViews";
import { ChatDock } from "../components/ChatDock";

export default defineAssistView({
  id: "chat",
  label: "AI 对话",
  component: ChatDock,
  keepAlive: true,
  feature: "chat",
  hiddenOn: ({ key, ownsChat }) => key === "chat" || ownsChat,
});
