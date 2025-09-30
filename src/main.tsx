// import { scan } from "react-scan";
// scan({
//   enabled: import.meta.env.DEV,
// });
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import ReactDOM from "react-dom/client";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

import "./init";
import "./main.less";

import App from "@/App.tsx";

dayjs.locale("zh-cn");
useBackendWebsocketStore.getState().initClient();

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
