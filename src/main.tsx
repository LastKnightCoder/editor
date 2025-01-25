import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

import './init.js';
import './main.less';

import App from "@/App.tsx";

dayjs.locale('zh-cn');

window.electron.invoke('resource|get_home_dir').then((dir) => {
  console.log('home_dir', dir);
});

ReactDOM
  .createRoot(document.getElementById('root')!)
  .render(<App />)
