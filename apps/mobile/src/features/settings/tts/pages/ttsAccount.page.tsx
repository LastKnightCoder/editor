import { TtsAccountPage } from "../TtsAccountPage";
import { createPageSchema, definePage, paramString, usePage } from "../../../../router";

const schema = createPageSchema({ instanceId: paramString() });
type Params = typeof schema.type;

function TtsAccountScreen() {
  const { params } = usePage<Params>();
  return <TtsAccountPage key={params.instanceId} instanceId={params.instanceId} />;
}

export default definePage({
  key: "ttsAccount",
  match: "params",
  getId: params => params.instanceId,
  params: schema.schema,
  component: TtsAccountScreen,
});
