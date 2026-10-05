import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";
import { initToolCallRenderers } from "@/tool-call-renderers";
import { initExtensionTheme } from "@/stores/useExtensionTheme";

// 渲染前就位 data-theme / data-mode，首帧不闪
initExtensionTheme();
initToolCallRenderers();

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
