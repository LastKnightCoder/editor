// 预设编辑页（P3·独立编辑页）。presetId 传 -1 表示新建。

import { PresetEditPage } from "../PresetEditPage";
import { useAppContext } from "../../../app/AppContext";
import { createPageSchema, definePage, paramNumber, useNavigator, usePage } from "../../../router";

const presetEditSchema = createPageSchema({
  presetId: paramNumber(),
});
type PresetEditParams = typeof presetEditSchema.type;

function PresetEditScreen() {
  const { params } = usePage<PresetEditParams>();
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <PresetEditPage
      presetId={params.presetId}
      onBack={() => navigator.goBack("ui")}
      onError={(error, fallback) => app.presentError(error, fallback)}
    />
  );
}

export default definePage({
  key: "pomodoroPresetEdit",
  match: "single",
  params: presetEditSchema.schema,
  component: PresetEditScreen,
});
