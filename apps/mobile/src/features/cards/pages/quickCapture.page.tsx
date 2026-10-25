// 快速捕获 overlay：持久化/草稿/清空逻辑由 useQuickCaptureController 承载，
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

  // 所有关闭路径（X/下拉/系统返回）统一走 goBack → backHandler：先冲洗落库，
  // 成功返回 false 放行弹栈，失败返回 true 拦截保留页面。
  // 切忌无条件 return true 再内嵌 goBack——router 视 true 为"已消费"不弹栈，互喂成死循环
  useBackHandler(async () => {
    const closed = await controller.requestClose();
    return !closed;
  });

  return (
    <QuickCaptureSheet
      open
      saving={controller.saving}
      document={controller.document}
      editorRef={controller.editorRef}
      readonly={controller.readonly}
      onContentChange={controller.onContentChange}
      onClear={controller.onClear}
      onRequestClose={() => {
        void navigator.goBack("ui");
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
