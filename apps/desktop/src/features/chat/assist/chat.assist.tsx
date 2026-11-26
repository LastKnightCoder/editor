import { appTranslator } from "@/app/i18n/messages";
import { defineAssistView } from "@/app/assistViews";
import { ChatDock } from "../components/ChatDock";

export default defineAssistView({
  id: "chat",
  get label() {
    return appTranslator.t("nav.chat");
  },
  component: ChatDock,
  keepAlive: true,
  feature: "chat",
  hiddenOn: ({ key, ownsChat }) => key === "chat" || ownsChat,
});
