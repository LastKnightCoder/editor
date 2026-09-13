// 加入协作（设计稿 02 方案 A）：overlay 层浮层，主体 BottomSheet 自带返回拦截。
import { lazy, Suspense } from "react";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";
import { CollaborationLoading } from "../components/CollaborationLoading";
import { useCollaborationRuntime } from "../hooks/useCollaborationRuntime";

const JoinCollabSheet = lazy(() =>
  import("../JoinCollabSheet").then(module => ({ default: module.JoinCollabSheet }))
);

function JoinSheetScreen() {
  const navigator = useNavigator();
  const app = useAppContext();
  useCollaborationRuntime();
  return (
    <Suspense fallback={<CollaborationLoading />}>
      <JoinCollabSheet
        onClose={() => void navigator.goBack("ui")}
        onError={(error, fallback) => app.presentError(error, fallback)}
      />
    </Suspense>
  );
}

export default definePage({
  key: "joinSheet",
  layer: "overlay",
  match: "single",
  params: {},
  component: JoinSheetScreen,
});
