// 上传服务页：providerId 即页面身份，取值为上传服务注册表里的 id（内置与将来插件服务共用）。

import { UploadProviderPage } from "../upload/UploadProviderPage";
import { createPageSchema, definePage, paramString, usePage } from "../../../router";

const uploadProviderSchema = createPageSchema({
  providerId: paramString(),
});
type UploadProviderParams = typeof uploadProviderSchema.type;

function UploadProviderScreen() {
  const { params } = usePage<UploadProviderParams>();
  return <UploadProviderPage providerId={params.providerId} />;
}

export default definePage({
  key: "uploadProvider",
  match: "params",
  getId: p => p.providerId,
  params: uploadProviderSchema.schema,
  component: UploadProviderScreen,
});
