// 协作中心（设计稿 01 方案 A）：screen 层常规页面。
// 组件经懒加载引入，把 yjs/hocuspocus 隔离在协作动态 chunk 内。
import { lazy, Suspense } from "react";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";
import { CollaborationLoading } from "../components/CollaborationLoading";
import { useCollaborationRuntime } from "../hooks/useCollaborationRuntime";

const CollaborationCenterPage = lazy(() =>
  import("../CollaborationCenterPage").then(module => ({ default: module.CollaborationCenterPage }))
);

function CollaborationCenterScreen() {
  const navigator = useNavigator();
  const app = useAppContext();
  useCollaborationRuntime();
  return (
    <Suspense fallback={<CollaborationLoading />}>
      <CollaborationCenterPage
        onBack={() => void navigator.goBack("ui")}
        onError={(error, fallback) => app.presentError(error, fallback)}
      />
    </Suspense>
  );
}

export default definePage({
  key: "collaborationCenter",
  match: "single",
  params: {},
  component: CollaborationCenterScreen,
});
