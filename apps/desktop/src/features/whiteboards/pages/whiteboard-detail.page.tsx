/**
 * 白板详情 page 定义（多页）：一块白板一个实例（getId 按白板 id）；page = 当前页，
 * 同一白板内切页由栈机原位更新参数，不堆后退历史。
 */

import { createPageSchema, paramNumber, paramOptional } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { WhiteboardDetailView } from "../views/WhiteboardDetailView";

const schema = createPageSchema({
  id: paramNumber(),
  page: paramOptional(paramNumber()),
});

export default definePage({
  key: "whiteboard-detail",
  match: "params",
  getId: params => `whiteboard-detail-${params.id}`,
  label: "白板",
  status: "new",
  params: schema.schema,
  component: WhiteboardDetailView,
});
