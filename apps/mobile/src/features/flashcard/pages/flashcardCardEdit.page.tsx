// 卡片新建/编辑页（screen·multi 每次新实例）。cardId=-1 为新建（type 为初始题型，
// 缺省 qa——卡组页「＋」直达时不经过选题型页）；编辑态以卡片数据为准。保存后 pop 回列表。

import { CardEditPage } from "../CardEditPage";
import { useAppContext } from "../../../app/AppContext";
import {
  createPageSchema,
  definePage,
  paramNumber,
  paramOptional,
  paramString,
  useNavigator,
  usePage,
} from "../../../router";
import type { FlashcardType } from "../types";

const editSchema = createPageSchema({
  deckId: paramNumber(),
  cardId: paramNumber(),
  type: paramOptional(paramString()),
  refContentId: paramOptional(paramNumber()),
  refTitle: paramOptional(paramString()),
});
type EditPageParams = typeof editSchema.type;

function CardEditScreen() {
  const { params } = usePage<EditPageParams>();
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <CardEditPage
      deckId={params.deckId}
      cardId={params.cardId}
      type={(params.type as FlashcardType | undefined) ?? "qa"}
      reference={
        params.refContentId && params.refContentId > 0
          ? { refType: "content", contentId: params.refContentId, title: params.refTitle ?? "" }
          : undefined
      }
      // onBack 的调用点都是“已决定离开”（干净退出/保存后/确认放弃）：绕过拦截，
      // 否则确认框 onConfirm→goBack 会被页面自身的 useBackHandler 再吞一次（退不出的死锁）
      onBack={() => navigator.goBackBypassed("ui")}
      onSaved={() => navigator.goBackBypassed("ui")}
      onError={(error, fallback) => app.presentError(error, fallback)}
    />
  );
}

export default definePage({
  key: "flashcardCardEdit",
  match: "multi",
  params: editSchema.schema,
  component: CardEditScreen,
});
