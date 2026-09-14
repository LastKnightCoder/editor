// 卡组详情页（screen）。deckId 定位单个卡组；match:params 按卡组身份去重。

import { FlashcardDeckPage } from "../FlashcardDeckPage";
import { useAppContext } from "../../../app/AppContext";
import { createPageSchema, definePage, paramNumber, useNavigator, usePage } from "../../../router";

const deckSchema = createPageSchema({
  deckId: paramNumber(),
});
type DeckPageParams = typeof deckSchema.type;

function FlashcardDeckScreen() {
  const { params } = usePage<DeckPageParams>();
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <FlashcardDeckPage
      deckId={params.deckId}
      onBack={() => navigator.goBack("ui")}
      onOpenReview={deckId => navigator.push("flashcardReview", { deckId })}
      onEditCard={cardId => navigator.push("flashcardCardEdit", { deckId: params.deckId, cardId })}
      onCreateCard={deckId => navigator.push("flashcardCardEdit", { deckId, cardId: -1 })}
      onError={(error, fallback) => app.presentError(error, fallback)}
    />
  );
}

export default definePage({
  key: "flashcardDeck",
  match: "params",
  getId: ({ deckId }) => `d${deckId}`,
  params: deckSchema.schema,
  component: FlashcardDeckScreen,
});
