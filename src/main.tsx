import ReactDOM from 'react-dom/client';
import { RouterProvider } from "react-router-dom";
import './init.js';

import router from "./router";
import './main.less';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<RouterProvider router={router} />)
