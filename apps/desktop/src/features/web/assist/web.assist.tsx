import { appTranslator } from "@/app/i18n/messages";
import { defineAssistView } from "@/app/assistViews";
import { WebDock } from "../components/WebDock";

export default defineAssistView({
  id: "web",
  get label() {
    return appTranslator.t("assist.webLabel");
  },
  component: WebDock,
});
