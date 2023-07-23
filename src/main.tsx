import ReactDOM from 'react-dom/client';
import { RouterProvider } from "react-router-dom";
import { ConfigProvider, theme } from 'antd';
import './init.js';

import router from "./router";
import './main.less';

ReactDOM
  .createRoot(document.getElementById('root')!)
  .render((
    <ConfigProvider theme={{
      algorithm: theme.darkAlgorithm,
    }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  ))

