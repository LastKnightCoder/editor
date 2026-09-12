import { ProjectDetailPage } from "../ProjectDetailPage";
import { useAppContext } from "../../../app/AppContext";
import { createPageSchema, definePage, paramNumber, useNavigator, usePage } from "../../../router";

const projectDetailSchema = createPageSchema({
  projectId: paramNumber(),
});
type ProjectDetailParams = typeof projectDetailSchema.type;

function ProjectDetailScreen() {
  const { params } = usePage<ProjectDetailParams>();
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <ProjectDetailPage
      projectId={params.projectId}
      onBack={() => navigator.goBack("ui")}
      onBackToList={() => navigator.popTo("projects")}
      onOpenDocEditor={(item, projectTitle) =>
        navigator.push("projectDocEditor", {
          itemId: item.id,
          projectTitle,
        })
      }
      onOpenCard={cardId => navigator.push("contentDetail", { cardId })}
      onError={(error, fallback) => {
        app.presentError(error, fallback);
      }}
    />
  );
}

export default definePage({
  key: "projectDetail",
  match: "params",
  getId: p => String(p.projectId),
  params: projectDetailSchema.schema,
  component: ProjectDetailScreen,
});
