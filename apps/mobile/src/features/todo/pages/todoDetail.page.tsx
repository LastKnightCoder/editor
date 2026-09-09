import { TodoDetailPage } from "../TodoDetailPage";
import { useAppContext } from "../../../app/AppContext";
import { definePage, paramNumber, paramOptional, useNavigator, usePage } from "../../../router";

type TodoDetailParams = {
  todoId: number;
  groupId?: number;
};

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
  params: {
    todoId: paramNumber(),
    groupId: paramOptional(paramNumber()),
  },
  component: TodoDetailScreen,
});
