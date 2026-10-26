// 识别插件账号页：providerId 即插件 id。

import { SpeechInputProviderPage } from "../speech/SpeechInputProviderPage";
import { createPageSchema, definePage, paramString, usePage } from "../../../router";

const schema = createPageSchema({
  providerId: paramString(),
});
type Params = typeof schema.type;

function SpeechInputProviderScreen() {
  const { params } = usePage<Params>();
  return <SpeechInputProviderPage providerId={params.providerId} />;
}

export default definePage({
  key: "speechInputProvider",
  match: "params",
  getId: p => p.providerId,
  params: schema.schema,
  component: SpeechInputProviderScreen,
});
