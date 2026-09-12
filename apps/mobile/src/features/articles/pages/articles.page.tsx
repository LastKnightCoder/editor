import { ArticlesPage } from "../ArticlesPage";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";

function ArticlesScreen() {
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <ArticlesPage
      onBack={() => navigator.goBack("ui")}
      onOpenArticle={articleId => navigator.push("articleEditor", { articleId })}
      onOpenSearch={() => navigator.push("search")}
      onError={(error, fallback) => {
        app.presentError(error, fallback);
      }}
    />
  );
}

export default definePage({
  key: "articles",
  match: "single",
  params: {},
  component: ArticlesScreen,
});
