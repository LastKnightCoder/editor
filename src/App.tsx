import {ConfigProvider, theme} from "antd";
import zhCN from "antd/locale/zh_CN";
import {RouterProvider} from "react-router-dom";

import useSettingStore from "@/hooks/useSettingStore.ts";
import router from "@/router.tsx";
import {useEffect} from "react";

const App = () => {

  const {
    darkMode
  } = useSettingStore(state => ({
    darkMode: state.darkMode,
  }));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  return (
    <ConfigProvider
      theme={{
        algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
      locale={zhCN}
    >
      <RouterProvider router={router} />
    </ConfigProvider>
  )
}

export default App;