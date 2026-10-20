import { lazy, Suspense } from "react";
import { usePluginActionUi } from "@/app/plugins/app";

// 导出、演示与协作界面较重，插件第一次调用动作时才加载
const PluginContentActionView = lazy(() => import("./PluginContentActionView"));

/** 插件 context.app.run 打开的宿主界面（壳层挂载）：一次只显示一个，插件停用即撤下 */
export function PluginContentActionHost() {
  const request = usePluginActionUi(state => state.request);
  if (!request) return null;
  return (
    <Suspense fallback={null}>
      <PluginContentActionView key={request.id} request={request} />
    </Suspense>
  );
}
