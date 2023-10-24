import {ConfigProvider, theme} from "antd";
import zhCN from "antd/locale/zh_CN";
import {RouterProvider} from "react-router-dom";

import router from "@/router.tsx";
import useTheme from "@/hooks/useTheme.ts";

const App = () => {
  const { isDark } = useTheme();

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
      locale={zhCN}
    >
      <RouterProvider router={router} />
    </ConfigProvider>
  )
}

export default App;