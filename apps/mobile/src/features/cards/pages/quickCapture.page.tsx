// 快速闪念 overlay：持久化/草稿/清空逻辑由 useQuickCaptureController 承载，
// 页面组件只做组装。控制器随页面实例创建、关闭即销毁。

import { QuickCaptureSheet } from "../QuickCaptureSheet";
import { useQuickCaptureController } from "../quickCapture/useQuickCaptureController";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useBackHandler, useNavigator } from "../../../router";

function QuickCaptureScreen() {
  const app = useAppContext();
  const navigator = useNavigator();
  const controller = useQuickCaptureController({
    presentError: (error, fallback) => app.presentError(error, fallback),
    refreshCards: () => app.refreshCardsSafe({ page: 1 }),
  });

  // 系统返回/手势返回也收进 flush 流程（防抖期内未落库内容先持久化再关闭），
  // 冲洗失败时保留页面由用户处理
  useBackHandler(() => {
    void controller.requestClose().then(closed => {
      if (closed) {
        navigator.goBack("ui");
      }
    });
    return true;
  });

  return (
    <QuickCaptureSheet
      open
      saving={controller.saving}
      category={controller.category}
      onContentChange={controller.onContentChange}
      onCategoryChange={controller.onCategoryChange}
      onClear={controller.onClear}
      onRequestClose={content => {
        void controller.requestClose(content).then(closed => {
          if (closed) {
            navigator.goBack("ui");
          }
        });
      }}
    />
  );
}

export default definePage({
  key: "quickCapture",
  layer: "overlay",
  match: "single",
  params: {},
  component: QuickCaptureScreen,
});
