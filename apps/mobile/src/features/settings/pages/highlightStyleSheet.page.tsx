// 背景高亮笔触 overlay：BottomSheet 形态，点选即时生效（无草稿，无需关闭守卫）。
// layer: "overlay" 使打开动作入 history——返回手势优先关闭本面板而非弹页面栈。

import { BottomSheet } from "../../../components/BottomSheet";
import { definePage, useNavigator } from "../../../router";
import { HighlightStyleSection } from "../components/HighlightStyleSection";

function HighlightStyleSheetScreen() {
  const navigator = useNavigator();
  return (
    <BottomSheet open title="背景高亮" onClose={() => void navigator.goBack("ui")}>
      <HighlightStyleSection />
    </BottomSheet>
  );
}

export default definePage({
  key: "settings-highlight-style",
  layer: "overlay",
  match: "single",
  params: {},
  component: HighlightStyleSheetScreen,
});
