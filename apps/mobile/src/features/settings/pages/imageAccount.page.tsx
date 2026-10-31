import { createPageSchema, definePage, paramOptional, paramString, usePage } from "../../../router";
import { ImageAccountPage } from "../images/ImageAccountPage";

const schema = createPageSchema({
  settingsId: paramString(),
  accountId: paramOptional(paramString()),
});
function ImageAccountScreen() {
  const { params } = usePage<typeof schema.type>();
  return <ImageAccountPage key={`${params.settingsId}:${params.accountId ?? "new"}`} {...params} />;
}
export default definePage({
  key: "imageAccount",
  match: "params",
  getId: params => `${params.settingsId}:${params.accountId ?? "new"}`,
  params: schema.schema,
  component: ImageAccountScreen,
});
