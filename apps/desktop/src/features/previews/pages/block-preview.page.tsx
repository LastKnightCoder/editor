import { definePage } from "@/page/definePage";
import { createPageSchema, paramString } from "@/page/core/paramsSchema";
import { BlockPreviewView } from "../views/BlockPreviewView";

const schema = createPageSchema({ id: paramString(), block: paramString() });

export default definePage({
  key: "block-preview",
  match: "params",
  getId: params => params.id,
  label: "内容预览",
  params: schema.schema,
  component: BlockPreviewView,
});
