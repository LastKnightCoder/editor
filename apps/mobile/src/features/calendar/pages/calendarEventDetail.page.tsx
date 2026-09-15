// 日程详情页（screen/params，按事件身份去重）。删除在页面层落库后弹栈，
// 编辑跳转携带事件 id；系统事件提供番茄钟/待办来源跳转。

import { CalendarEventDetailPage } from "../CalendarEventDetailPage";
import { useAppContext } from "../../../app/AppContext";
import { createPageSchema, definePage, paramNumber, useNavigator, usePage } from "../../../router";
import * as tauri from "../../../services/tauri";
import { invalidateCalendarQueries } from "../queries";

const detailSchema = createPageSchema({
  eventId: paramNumber(),
});
type DetailPageParams = typeof detailSchema.type;

function CalendarEventDetailScreen() {
  const { params } = usePage<DetailPageParams>();
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <CalendarEventDetailPage
      eventId={params.eventId}
      onBack={() => navigator.goBack("ui")}
      onEdit={event =>
        navigator.push("calendarEventEdit", { eventId: event.id, prefillDate: null })
      }
      onDelete={eventId => {
        tauri
          .calendarEventDelete(eventId)
          .then(() => {
            invalidateCalendarQueries();
            navigator.goBack("ui");
          })
          .catch(error => app.presentError(error, "删除日程失败"));
      }}
      onOpenPomodoroHistory={day => navigator.push("pomodoroHistory", { day })}
      onOpenTodo={() => navigator.push("todo")}
    />
  );
}

export default definePage({
  key: "calendarEventDetail",
  match: "params",
  getId: ({ eventId }) => `e${eventId}`,
  params: detailSchema.schema,
  component: CalendarEventDetailScreen,
});
