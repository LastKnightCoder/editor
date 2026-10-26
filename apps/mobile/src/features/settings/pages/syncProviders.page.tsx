// 同步服务列表页：同步中心「同步到」行进入。

import { SyncProvidersPage } from "../sync/SyncProvidersPage";
import { definePage } from "../../../router";

export default definePage({
  key: "syncProviders",
  match: "single",
  params: {},
  component: SyncProvidersPage,
});
