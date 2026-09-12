// 图片渲染外观 overlay：BottomSheet 形态，点选即时生效（无草稿，无需关闭守卫）。
// layer: "overlay" 使打开动作入 history——返回手势优先关闭本面板而非弹页面栈。

import { BottomSheet } from "../../../components/BottomSheet";
import { definePage, useNavigator } from "../../../router";
import { ImageAppearanceSection } from "../components/ImageAppearanceSection";

function ImageAppearanceSheetScreen() {
  const navigator = useNavigator();
  return (
    // 主体面板用默认 backDismiss：返回手势经组件内置退场缓冲（先播动画、
    // 动画完成后才回调 onClose → goBack），不会与 goBack 互喂死锁
    <BottomSheet open title="图片渲染" onClose={() => void navigator.goBack("ui")}>
      <ImageAppearanceSection />
    </BottomSheet>
  );
}

export default definePage({
  key: "settings-image-appearance",
  layer: "overlay",
  match: "single",
  params: {},
  component: ImageAppearanceSheetScreen,
});
