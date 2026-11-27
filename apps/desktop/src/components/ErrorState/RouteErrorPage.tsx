import { useErrorStateI18n } from "./i18n";
/**
 * 路由级兜底（router errorElement）：页面 / 局部边界都没接住的错误落到这里——整窗替换，
 * 只能靠重载恢复。给出「重新加载 / 回到首页」两条路，技术细节折叠可复制。
 */

import { useEffect } from "react";
import { useRouteError } from "react-router-dom";
import { isElectron } from "@/electron";
import { ErrorState } from ".";

export function RouteErrorPage() {
  const { t } = useErrorStateI18n();
  const error = useRouteError();
  // 路由错误已被 react-router 接住，不会冒泡到 window.onerror，须在此落日志
  useEffect(() => {
    console.error("[route] 页面渲染失败", { path: location.hash }, error);
  }, [error]);
  return (
    <ErrorState
      size="page"
      error={error}
      title={t("route.title")}
      description={t(isElectron ? "route.description.electron" : "route.description.web")}
      actions={[
        { key: "reload", label: t("route.reload"), onClick: () => window.location.reload() },
        {
          key: "home",
          label: t("route.home"),
          onClick: () => {
            window.location.hash = "#/";
            window.location.reload();
          },
        },
      ]}
    />
  );
}
