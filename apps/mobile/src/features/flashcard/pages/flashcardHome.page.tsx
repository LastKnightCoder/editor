// 闪卡主页（screen）。卡组管理与今日概览在这里，复习进入 flashcardReview overlay。

import { FlashcardHomePage } from "../FlashcardHomePage";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";

function FlashcardHomeScreen() {
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <FlashcardHomePage
      onBack={() => navigator.goBack("ui")}
      onOpenDeck={deckId => navigator.push("flashcardDeck", { deckId })}
      onOpenReview={deckId => navigator.push("flashcardReview", { deckId: deckId ?? -1 })}
      onOpenStats={() => navigator.push("flashcardStats")}
      onError={(error, fallback) => app.presentError(error, fallback)}
    />
  );
}

export default definePage({
  key: "flashcardHome",
  match: "single",
  params: {},
  component: FlashcardHomeScreen,
});
