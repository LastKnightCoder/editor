// 正文字体 overlay：BottomSheet 形态，点选即时生效；下载在模块级 store 里进行，关闭面板不中断。
// layer: "overlay" 使打开动作入 history——返回手势优先关闭本面板而非弹页面栈。

import { useReadingFontI18n } from "../readingFont/i18n";
import { BottomSheet } from "../../../components/BottomSheet";
import { definePage, useNavigator } from "../../../router";
import { ReadingFontSection } from "../components/ReadingFontSection";

function ReadingFontSheetScreen() {
  const { t } = useReadingFontI18n();
  const navigator = useNavigator();
  return (
    <BottomSheet open title={t("title")} onClose={() => void navigator.goBack("ui")}>
      <ReadingFontSection />
    </BottomSheet>
  );
}

export default definePage({
  key: "settings-reading-font",
  layer: "overlay",
  match: "single",
  params: {},
  component: ReadingFontSheetScreen,
});
