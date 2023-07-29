import ReactDOM from 'react-dom/client';
import { RouterProvider } from "react-router-dom";
import { ConfigProvider, theme } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
dayjs.locale('zh-cn');
import zhCN from 'antd/locale/zh_CN';
import './init.js';

import router from "./router";
import './main.less';

ReactDOM
  .createRoot(document.getElementById('root')!)
  .render((
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
      }}
      locale={zhCN}
    >
      <RouterProvider router={router} />
    </ConfigProvider>
  ))

