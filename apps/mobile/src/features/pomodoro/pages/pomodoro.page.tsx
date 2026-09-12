// 番茄专注主页（P1·清单式）。

import { PomodoroPage } from "../PomodoroPage";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";

function PomodoroScreen() {
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <PomodoroPage
      onBack={() => navigator.goBack("ui")}
      onOpenFocus={() => navigator.push("pomodoroFocus")}
      onOpenHistory={() => navigator.push("pomodoroHistory")}
      onEditPreset={presetId => navigator.push("pomodoroPresetEdit", { presetId })}
      onCreatePreset={() => navigator.push("pomodoroPresetEdit", { presetId: -1 })}
      onError={(error, fallback) => app.presentError(error, fallback)}
    />
  );
}

export default definePage({
  key: "pomodoro",
  match: "single",
  params: {},
  component: PomodoroScreen,
});
