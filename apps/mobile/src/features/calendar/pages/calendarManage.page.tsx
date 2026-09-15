// 日历管理页（screen/single）：系统/我的/归档三分区，可见性开关与新建日历 Sheet。

import { CalendarManagePage } from "../CalendarManagePage";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";

function CalendarManageScreen() {
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <CalendarManagePage
      onBack={() => navigator.goBack("ui")}
      onError={(error, fallback) => app.presentError(error, fallback)}
    />
  );
}

export default definePage({
  key: "calendarManage",
  match: "single",
  params: {},
  component: CalendarManageScreen,
});
