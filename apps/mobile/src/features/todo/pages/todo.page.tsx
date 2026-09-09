import { TodoPage } from "../TodoPage";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator, usePageInstanceContext } from "../../../router";

function TodoScreen() {
  const navigator = useNavigator();
  const app = useAppContext();
  const ctx = usePageInstanceContext();

  return (
    <TodoPage
      isVisible={ctx.phase === "active"}
      onBack={() => navigator.goBack("ui")}
      onOpenDetail={(todoId, groupId) => navigator.push("todoDetail", { todoId, groupId })}
      onError={(error, fallback) => {
        app.presentError(error, fallback);
      }}
      databaseName={
        app.syncSettings.safeSetting?.database?.active ??
        app.bootstrap.databases?.activeDatabase ??
        null
      }
    />
  );
}

export default definePage({
  key: "todo",
  match: "single",
  params: {},
  component: TodoScreen,
});
