import { defineAssistView } from "@/app/assistViews";
import { WebDock } from "../components/WebDock";

export default defineAssistView({
  id: "web",
  label: "网页",
  component: WebDock,
});
