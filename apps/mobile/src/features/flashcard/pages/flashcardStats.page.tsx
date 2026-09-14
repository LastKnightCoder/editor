// 复习统计页（screen）。入口在闪卡主页概览卡。

import { FlashcardStatsPage } from "../FlashcardStatsPage";
import { definePage, useNavigator } from "../../../router";

function FlashcardStatsScreen() {
  const navigator = useNavigator();
  return (
    <FlashcardStatsPage
      onBack={() => navigator.goBack("ui")}
      onOpenReview={() => navigator.push("flashcardReview", { deckId: -1 })}
    />
  );
}

export default definePage({
  key: "flashcardStats",
  match: "single",
  params: {},
  component: FlashcardStatsScreen,
});
