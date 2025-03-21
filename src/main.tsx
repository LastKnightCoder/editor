import { scan } from "react-scan";
import ReactDOM from "react-dom/client";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

import "./init.js";
import "./main.less";

import App from "@/App.tsx";

dayjs.locale("zh-cn");
scan({
  enabled: import.meta.env.DEV,
});

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
