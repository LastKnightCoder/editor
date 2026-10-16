import { createMockApi } from "./mockApi";
import { MockPanel } from "./MockPanel";

/**
 * 启动显式模拟模式：数据存 localStorage（刷新保留）。
 * 「GitHub 登录」在模拟模式下导航到 /submissions?mock_login=1，对应真实回调落地页。
 */
export function startMock() {
  const { api, controller } = createMockApi({ storage: window.localStorage });
  const url = new URL(window.location.href);
  if (url.searchParams.has("mock_login")) {
    controller.signIn();
    url.searchParams.delete("mock_login");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  console.info("[plugin-portal] 模拟模式：所有接口由本地模拟适配器响应，不会访问后端");
  return { api, panel: <MockPanel controller={controller} /> };
}
