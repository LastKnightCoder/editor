import ReactDOM from "react-dom/client";
import App from "./App";
import { initializeContentPlugins } from "../../services/contentPlugins";
import "./style.css";
import { initToolCallRenderers } from "@/tool-call-renderers";
import { initExtensionTheme } from "@/stores/useExtensionTheme";

// 渲染前就位 data-theme / data-mode，首帧不闪
initExtensionTheme();
initToolCallRenderers();

void initializeContentPlugins()
  .then(() => ReactDOM.createRoot(document.getElementById("root")!).render(<App />))
  .catch(error => {
    const root = document.getElementById("root")!;
    root.setAttribute("role", "alert");
    root.textContent = `插件初始化失败：${String(error)}`;
  });
