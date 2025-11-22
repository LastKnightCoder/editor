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
import "./tailwind";
import "./main.less";

import App from "@/App.tsx";

dayjs.locale("zh-cn");
useBackendWebsocketStore.getState().initClient();
useDynamicExtensionsStore.getState().initExtensions();

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
