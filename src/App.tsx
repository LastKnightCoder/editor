import { useEffect } from "react";
import { ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { RouterProvider } from "react-router-dom";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import router from "@/router.tsx";
import useTheme from "@/hooks/useTheme.ts";
import useSettingStore from "@/stores/useSettingStore";
import useArticleManagementStore from "@/stores/useArticleManagementStore";
import useCardsManagementStore from "@/stores/useCardsManagementStore";
import useDocumentsStore from "@/stores/useDocumentsStore";
import useSyncFont from "@/hooks/useSyncFont.ts";
import useSyncTheme from "@/hooks/useSyncTheme";


const App = () => {
  const { isDark } = useTheme();

  const {
    initSetting,
  } = useSettingStore(state => ({
    initSetting: state.initSetting,
  }));

  const {
    initArticles
  } = useArticleManagementStore(state => ({
    initArticles: state.init
  }));

  const {
    initCards,
  } = useCardsManagementStore((state) => ({
    initCards: state.init,
  }));

  const {
    initDocuments,
  } = useDocumentsStore(state => ({
    initDocuments: state.init,
  }));

  useEffect(() => {
    initSetting();
    initArticles().then();
    initCards().then();
    initDocuments().then();
  }, [initSetting, initArticles, initCards, initDocuments]);

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
      <DndProvider backend={HTML5Backend}>
        <RouterProvider router={router} />
      </DndProvider>
    </ConfigProvider>
  )
}

export default App;