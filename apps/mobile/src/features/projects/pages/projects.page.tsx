import { ProjectsPage } from "../ProjectsPage";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";

function ProjectsScreen() {
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <ProjectsPage
      onBack={() => navigator.goBack("ui")}
      onOpenProject={projectId => navigator.push("projectDetail", { projectId })}
      onError={(error, fallback) => {
        app.presentError(error, fallback);
      }}
    />
  );
}

export default definePage({
  key: "projects",
  match: "single",
  params: {},
  component: ProjectsScreen,
});
