import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

import '../src/init.js';
import '../src/main.less';

import Profile from "./Profile.tsx";

dayjs.locale('zh-cn');

ReactDOM
  .createRoot(document.getElementById('root')!)
  .render(<Profile />)
