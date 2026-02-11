// import { scan } from "react-scan";
// scan({
//   enabled: import.meta.env.DEV,
// });
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import ReactDOM from "react-dom/client";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

import "./init";
import "./tailwind.css";
import "./main.less";

import App from "@/App.tsx";
import { initializeTooling } from "@/tools";
import { initBlockRenderers } from "@/renderers";
import { initializeTabContentProviders } from "@/mcp/tab-content/providers";

dayjs.locale("zh-cn");
useBackendWebsocketStore.getState().initClient();
initializeTooling();
initBlockRenderers();
initializeTabContentProviders();

const bootstrap = async () => {
  await useDynamicExtensionsStore.getState().initExtensions();
  ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
};

void bootstrap();
