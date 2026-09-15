// 专注记录页（P4·周条形图）。可选 day 参数（本地 00:00）：从日程详情进入时聚焦该日记录。

import { PomodoroHistoryPage } from "../PomodoroHistoryPage";
import { useAppContext } from "../../../app/AppContext";
import {
  createPageSchema,
  definePage,
  paramNumber,
  paramOptional,
  useNavigator,
  usePage,
} from "../../../router";

const historySchema = createPageSchema({ day: paramOptional(paramNumber()) });
type HistoryPageParams = typeof historySchema.type;

function PomodoroHistoryScreen() {
  const navigator = useNavigator();
  const app = useAppContext();
  const { params } = usePage<HistoryPageParams>();

  return (
    <PomodoroHistoryPage
      focusDay={params.day ?? null}
      onBack={() => navigator.goBack("ui")}
      onError={(error, fallback) => app.presentError(error, fallback)}
    />
  );
}

export default definePage({
  key: "pomodoroHistory",
  match: "single",
  params: historySchema.schema,
  component: PomodoroHistoryScreen,
});
