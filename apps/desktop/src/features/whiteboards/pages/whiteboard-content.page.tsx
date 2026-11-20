import { definePage } from "@/page/definePage";
import { createPageSchema, paramNumber } from "@/page/core/paramsSchema";
import { WhiteboardContentView } from "../views/WhiteboardContentView";

const schema = createPageSchema({ id: paramNumber() });

export default definePage({
  key: "whiteboard-content",
  match: "params",
  getId: params => `whiteboard-content-${params.id}`,
  label: "白板",
  params: schema.schema,
  component: WhiteboardContentView,
});
