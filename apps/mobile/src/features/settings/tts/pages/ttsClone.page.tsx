import { TtsClonePage } from "../TtsClonePage";
import {
  createPageSchema,
  definePage,
  paramOptional,
  paramString,
  usePage,
} from "../../../../router";

const schema = createPageSchema({
  instanceId: paramString(),
  modelId: paramOptional(paramString()),
});
type Params = typeof schema.type;

function TtsCloneScreen() {
  const { params } = usePage<Params>();
  return (
    <TtsClonePage
      key={`${params.instanceId}:${params.modelId ?? ""}`}
      instanceId={params.instanceId}
      modelId={params.modelId}
    />
  );
}

export default definePage({
  key: "ttsClone",
  match: "params",
  getId: params => params.instanceId,
  params: schema.schema,
  component: TtsCloneScreen,
});
