import ReactDOM from 'react-dom/client';
import { RouterProvider } from "react-router-dom";
import './init.js';

import router from "./router";
import './main.less';
import { getAppPath } from "@/commands";

ReactDOM
  .createRoot(document.getElementById('root')!)
  .render(<RouterProvider router={router} />)

getAppPath()
