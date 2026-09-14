// 建卡·题型选择页（screen）。

import { CardCreatePage } from "../CardCreatePage";
import {
  createPageSchema,
  definePage,
  paramNumber,
  paramOptional,
  paramString,
  useNavigator,
  usePage,
} from "../../../router";

const createSchema = createPageSchema({
  // -1 = 未指定归属（主页直达），页面内自动选中第一个卡组
  deckId: paramNumber(-1),
  /** 从内容详情进入时携带的参考资料（contents 表 id），新建后自动挂到卡片 */
  refContentId: paramOptional(paramNumber()),
  refTitle: paramOptional(paramString()),
});
type CreatePageParams = typeof createSchema.type;

function CardCreateScreen() {
  const { params } = usePage<CreatePageParams>();
  const navigator = useNavigator();

  return (
    <CardCreatePage
      defaultDeckId={params.deckId}
      referenceTitle={params.refTitle}
      onBack={() => navigator.goBack("ui")}
      onChoose={(deckId, type) =>
        navigator.push("flashcardCardEdit", {
          deckId,
          cardId: -1,
          type,
          // 参考资料必须透传到编辑页，否则「加入闪卡」的引用挂接在中转页断链
          refContentId: params.refContentId,
          refTitle: params.refTitle,
        })
      }
    />
  );
}

export default definePage({
  key: "flashcardCreate",
  match: "params",
  getId: ({ deckId }) => `n${deckId}`,
  params: createSchema.schema,
  component: CardCreateScreen,
});
