import { KnowledgePage } from "../KnowledgePage";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";

function KnowledgeScreen() {
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <KnowledgePage
      onBack={() => navigator.goBack("ui")}
      onOpenLibrary={libraryId => navigator.push("knowledgeDetail", { libraryId })}
      onOpenSearch={() => navigator.push("search")}
      onError={(error, fallback) => {
        app.presentError(error, fallback);
      }}
    />
  );
}

export default definePage({
  key: "knowledge",
  match: "single",
  params: {},
  component: KnowledgeScreen,
});
