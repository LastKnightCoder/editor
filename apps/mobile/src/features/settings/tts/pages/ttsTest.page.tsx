import { TtsTestPage } from "../TtsTestPage";
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
  voiceId: paramOptional(paramString()),
});
type Params = typeof schema.type;

function TtsTestScreen() {
  const { params } = usePage<Params>();
  return (
    <TtsTestPage
      key={`${params.instanceId}:${params.modelId ?? ""}:${params.voiceId ?? ""}`}
      instanceId={params.instanceId}
      modelId={params.modelId}
      voiceId={params.voiceId}
    />
  );
}

export default definePage({
  key: "ttsTest",
  match: "params",
  getId: params => params.instanceId,
  params: schema.schema,
  component: TtsTestScreen,
});
