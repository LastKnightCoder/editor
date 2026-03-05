import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";
import { initToolCallRenderers } from "@/tool-call-renderers";

initToolCallRenderers();

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
