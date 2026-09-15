// 日历主页（screen/single）。月历/周条两态、可见性过滤与今日列表在这里聚合。

import { CalendarHomePage } from "../CalendarHomePage";
import { definePage, useNavigator } from "../../../router";

function CalendarHomeScreen() {
  const navigator = useNavigator();

  return (
    <CalendarHomePage
      onBack={() => navigator.goBack("ui")}
      onCreateEvent={date => navigator.push("calendarEventEdit", { eventId: 0, prefillDate: date })}
      onOpenEvent={eventId => navigator.push("calendarEventDetail", { eventId })}
      onOpenManage={() => navigator.push("calendarManage")}
    />
  );
}

export default definePage({
  key: "calendarHome",
  match: "single",
  params: {},
  component: CalendarHomeScreen,
});
