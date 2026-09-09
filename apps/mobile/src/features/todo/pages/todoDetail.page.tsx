import { TodoDetailPage } from "../TodoDetailPage";
import { useAppContext } from "../../../app/AppContext";
import {
  createPageSchema,
  definePage,
  paramNumber,
  paramOptional,
  useNavigator,
  usePage,
} from "../../../router";

const todoDetailSchema = createPageSchema({
  todoId: paramNumber(),
  groupId: paramOptional(paramNumber()),
});
type TodoDetailParams = typeof todoDetailSchema.type;

function TodoDetailScreen() {
  const { params } = usePage<TodoDetailParams>();
  const navigator = useNavigator();
  const app = useAppContext();
  return (
    <TodoDetailPage
      todoId={params.todoId}
      groupId={params.groupId}
      onBack={() => navigator.goBack("ui")}
      onError={(error, fallback) => {
        app.presentError(error, fallback);
      }}
    />
  );
}

export default definePage({
  key: "todoDetail",
  match: "multi",
  params: todoDetailSchema.schema,
  component: TodoDetailScreen,
});
