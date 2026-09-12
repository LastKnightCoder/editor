import { KnowledgeDetailPage } from "../KnowledgeDetailPage";
import { useAppContext } from "../../../app/AppContext";
import { createPageSchema, definePage, paramNumber, useNavigator, usePage } from "../../../router";

const knowledgeDetailSchema = createPageSchema({
  libraryId: paramNumber(),
});
type KnowledgeDetailParams = typeof knowledgeDetailSchema.type;

function KnowledgeDetailScreen() {
  const { params } = usePage<KnowledgeDetailParams>();
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <KnowledgeDetailPage
      libraryId={params.libraryId}
      onBack={() => navigator.goBack("ui")}
      onOpenNodeEditor={(item, libraryTitle) =>
        navigator.push("knowledgeNodeEditor", {
          itemId: item.id,
          libraryTitle,
        })
      }
      onOpenCard={cardId => navigator.push("contentDetail", { cardId })}
      onOpenArticle={articleId => navigator.push("articleEditor", { articleId })}
      onError={(error, fallback) => {
        app.presentError(error, fallback);
      }}
    />
  );
}

export default definePage({
  key: "knowledgeDetail",
  match: "params",
  getId: p => String(p.libraryId),
  params: knowledgeDetailSchema.schema,
  component: KnowledgeDetailScreen,
});
