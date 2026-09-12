// 专注记录页（P4·周条形图）。

import { PomodoroHistoryPage } from "../PomodoroHistoryPage";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";

function PomodoroHistoryScreen() {
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <PomodoroHistoryPage
      onBack={() => navigator.goBack("ui")}
      onError={(error, fallback) => app.presentError(error, fallback)}
    />
  );
}

export default definePage({
  key: "pomodoroHistory",
  match: "single",
  params: {},
  component: PomodoroHistoryScreen,
});
