// 日程新建/编辑页（screen/multi 每次新实例）。eventId=0 为新建（prefillDate 预填日期），
// 编辑态以服务端数据为准；未保存守卫见 CalendarEventEditPage（useBackHandler 路线）。

import { CalendarEventEditPage } from "../CalendarEventEditPage";
import { useAppContext } from "../../../app/AppContext";
import {
  createPageSchema,
  definePage,
  paramNumber,
  paramOptional,
  useNavigator,
  usePage,
} from "../../../router";

const editSchema = createPageSchema({
  eventId: paramNumber(),
  prefillDate: paramOptional(paramNumber()),
});
type EditPageParams = typeof editSchema.type;

function CalendarEventEditScreen() {
  const { params } = usePage<EditPageParams>();
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <CalendarEventEditPage
      eventId={params.eventId}
      prefillDate={params.prefillDate ?? null}
      // onBack 的调用点都是“已决定离开”（干净退出/保存后/确认放弃）：绕过拦截，
      // 否则确认框 onConfirm→goBack 会被页面自身的 useBackHandler 再吞一次
      onBack={() => navigator.goBackBypassed("ui")}
      onSaved={() => navigator.goBackBypassed("ui")}
      onError={(error, fallback) => app.presentError(error, fallback)}
    />
  );
}

export default definePage({
  key: "calendarEventEdit",
  match: "multi",
  params: editSchema.schema,
  component: CalendarEventEditScreen,
});
