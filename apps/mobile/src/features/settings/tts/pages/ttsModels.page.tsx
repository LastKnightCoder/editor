import { TtsModelsPage } from "../TtsModelsPage";
import { createPageSchema, definePage, paramString, usePage } from "../../../../router";

const schema = createPageSchema({ instanceId: paramString() });
type Params = typeof schema.type;

function TtsModelsScreen() {
  const { params } = usePage<Params>();
  return <TtsModelsPage key={params.instanceId} instanceId={params.instanceId} />;
}

export default definePage({
  key: "ttsModels",
  match: "params",
  getId: params => params.instanceId,
  params: schema.schema,
  component: TtsModelsScreen,
});
