import { ProjectDetailPage } from "../ProjectDetailPage";
import { useAppContext } from "../../../app/AppContext";
import {
  createPageSchema,
  definePage,
  paramNumber,
  paramOptional,
  useNavigator,
  usePage,
} from "../../../router";

const projectDetailSchema = createPageSchema({
  projectId: paramNumber(),
  /** 下钻层级的节点；缺省为项目根层 */
  itemId: paramOptional(paramNumber()),
});
type ProjectDetailParams = typeof projectDetailSchema.type;

function ProjectDetailScreen() {
  const { params } = usePage<ProjectDetailParams>();
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <ProjectDetailPage
      projectId={params.projectId}
      itemId={params.itemId ?? null}
      onBack={() => navigator.goBack("ui")}
      onOpenLevel={itemId =>
        navigator.push("projectDetail", { projectId: params.projectId, itemId })
      }
      onJumpToLevel={itemId => {
        const target = { projectId: params.projectId, itemId };
        // 从树抽屉直达深层时栈内没有祖先层，原位替换为该层
        if (!navigator.popTo("projectDetail", target)) navigator.replace("projectDetail", target);
      }}
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
  // 每个层级一个实例：返回 / 右滑逐层退回
  match: "params",
  getId: p => `${p.projectId}:${p.itemId ?? "root"}`,
  params: projectDetailSchema.schema,
  component: ProjectDetailScreen,
});
