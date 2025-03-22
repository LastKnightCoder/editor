// import { scan } from "react-scan";
// scan({
//   enabled: import.meta.env.DEV,
// });
import ReactDOM from "react-dom/client";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

import "./init.js";
import "./main.less";

import App from "@/App.tsx";

dayjs.locale("zh-cn");

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
