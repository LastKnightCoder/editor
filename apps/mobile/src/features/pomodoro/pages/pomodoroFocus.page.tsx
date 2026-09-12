// 沉浸专注页（P2·全屏 overlay）。返回手势/收起 = 退场回主页，计时继续（后端持有会话）。

import { FocusImmersivePage } from "../FocusImmersivePage";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";

function PomodoroFocusScreen() {
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <FocusImmersivePage
      onRequestClose={() => navigator.goBack("ui")}
      onError={(error, fallback) => app.presentError(error, fallback)}
    />
  );
}

export default definePage({
  key: "pomodoroFocus",
  layer: "overlay",
  match: "single",
  params: {},
  component: PomodoroFocusScreen,
});
