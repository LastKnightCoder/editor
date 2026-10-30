import { lazy, Suspense } from "react";
import { createPageSchema, definePage, paramOptional, paramString, usePage } from "../../../router";

// 详情页要读内置模型目录，懒加载避免目录进入首屏包
const AiProviderPage = lazy(() =>
  import("../ai/AiProviderPage").then(module => ({ default: module.AiProviderPage }))
);

const schema = createPageSchema({
  providerId: paramString(),
  /** 新增时的预设 id（custom 为自定义）；已保存的服务商不传 */
  preset: paramOptional(paramString()),
});
type Params = typeof schema.type;

function AiProviderScreen() {
  const { params } = usePage<Params>();
  return (
    <Suspense fallback={<div className="bg-page fixed inset-0" />}>
      <AiProviderPage
        key={params.providerId}
        providerId={params.providerId}
        preset={params.preset}
      />
    </Suspense>
  );
}

export default definePage({
  key: "aiProvider",
  match: "params",
  getId: params => params.providerId,
  params: schema.schema,
  component: AiProviderScreen,
});
