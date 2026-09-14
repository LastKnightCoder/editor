// 复习页（overlay·全屏沉浸）。deckId=-1 表示全库队列。
// 返回手势由页面内 useBackHandler 消费（弹退出确认），不走 BottomSheet 内置拦截。

import { FlashcardReviewPage } from "../FlashcardReviewPage";
import { useAppContext } from "../../../app/AppContext";
import { createPageSchema, definePage, paramNumber, useNavigator, usePage } from "../../../router";

const reviewSchema = createPageSchema({
  deckId: paramNumber(),
});
type ReviewPageParams = typeof reviewSchema.type;

function FlashcardReviewScreen() {
  const { params } = usePage<ReviewPageParams>();
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <FlashcardReviewPage
      deckId={params.deckId}
      // 关闭请求都来自“已确认退出/已完成”：绕过拦截，否则 onConfirm→goBack 会被
      // 页面自身的 useBackHandler 吞掉，出现“点了退出却退不出”的死锁
      onRequestClose={() => navigator.goBackBypassed("ui")}
      onError={(error, fallback) => app.presentError(error, fallback)}
    />
  );
}

export default definePage({
  key: "flashcardReview",
  layer: "overlay",
  match: "params",
  getId: ({ deckId }) => `r${deckId}`,
  params: reviewSchema.schema,
  component: FlashcardReviewScreen,
});
