import { TodoPage } from "../TodoPage";
import { useAppContext } from "../../../app/AppContext";
import {
  createPageSchema,
  definePage,
  paramBoolean,
  useNavigator,
  usePage,
  usePageInstanceContext,
} from "../../../router";

const todoSchema = createPageSchema({
  openCreate: paramBoolean(false),
});
type TodoParams = typeof todoSchema.type;

function TodoScreen() {
  const navigator = useNavigator();
  const app = useAppContext();
  const ctx = usePageInstanceContext();
  const { params } = usePage<TodoParams>();

  return (
    <TodoPage
      isVisible={ctx.phase === "active"}
      autoOpenCreate={params.openCreate}
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
  params: todoSchema.schema,
  component: TodoScreen,
});
