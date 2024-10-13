import { useEffect } from "react";
import { App, ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { RouterProvider } from "react-router-dom";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import useSettingStore, { ELayout } from "@/stores/useSettingStore";
import useTheme from "@/hooks/useTheme.ts";
import useSyncFont from "@/hooks/useSyncFont.ts";
import useSyncTheme from "@/hooks/useSyncTheme";
import { shortSidebarRouter, classicRouter } from "@/router.tsx";

const Application = () => {
  const { isDark } = useTheme();

  const {
    initSetting,
    layout,
  } = useSettingStore(state => ({
    initSetting: state.initSetting,
    layout: state.setting.layout
  }));

  useEffect(() => {
    initSetting();
  }, [initSetting]);

  useSyncFont();
  useSyncTheme();

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        components: {
          Calendar: {
            fullBg: 'transparent',
          },
        },
      }}
      locale={zhCN}
    >
      <App style={{
        height: '100%',
        fontSize: 'var(--font-size)',
        color: 'var(--text-normal)',
      }}>
        <DndProvider backend={HTML5Backend}>
          <RouterProvider router={layout === ELayout.ThreeColumn ? classicRouter : shortSidebarRouter} />
        </DndProvider>
      </App>
    </ConfigProvider>
  )
}

export default Application;