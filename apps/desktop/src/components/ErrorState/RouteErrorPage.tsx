/**
 * 路由级兜底（router errorElement）：页面 / 局部边界都没接住的错误落到这里——整窗替换，
 * 只能靠重载恢复。给出「重新加载 / 回到首页」两条路，技术细节折叠可复制。
 */

import { useRouteError } from "react-router-dom";
import { ErrorState } from ".";

export function RouteErrorPage() {
  const error = useRouteError();
  return (
    <ErrorState
      size="page"
      error={error}
      title="应用遇到了意外错误"
      description="当前窗口无法继续显示。你的数据已保存在本地，重新加载通常即可恢复；如果反复出现，请复制错误信息反馈给我们。"
      actions={[
        { label: "重新加载", onClick: () => window.location.reload() },
        {
          label: "回到首页",
          onClick: () => {
            window.location.hash = "#/";
            window.location.reload();
          },
        },
      ]}
    />
  );
}
