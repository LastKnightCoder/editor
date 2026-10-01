import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("示例根节点不存在");
const root = createRoot(container);
root.render(<App />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
