// 同步服务页：providerId 即页面身份，取值为同步服务注册表里的 id（内置与将来插件服务共用）。

import { SyncProviderPage } from "../sync/SyncProviderPage";
import { createPageSchema, definePage, paramString, usePage } from "../../../router";

const syncProviderSchema = createPageSchema({
  providerId: paramString(),
});
type SyncProviderParams = typeof syncProviderSchema.type;

function SyncProviderScreen() {
  const { params } = usePage<SyncProviderParams>();
  return <SyncProviderPage providerId={params.providerId} />;
}

export default definePage({
  key: "syncProvider",
  match: "params",
  getId: p => p.providerId,
  params: syncProviderSchema.schema,
  component: SyncProviderScreen,
});
