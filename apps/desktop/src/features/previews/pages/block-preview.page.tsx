import { definePage } from "@/page/definePage";
import {
  createPageSchema,
  paramNumber,
  paramOptional,
  paramString,
} from "@/page/core/paramsSchema";
import { BlockPreviewView } from "../views/BlockPreviewView";

/**
 * 块预览页（D-057）：两种参数形态——
 *  - 会话块：chat + key，内容从对话仓库实时派生；
 *  - 快照：block（整块 JSON），来自不在对话仓库里的对话 / MCP。
 */
const schema = createPageSchema({
  id: paramString(),
  chat: paramOptional(paramNumber()),
  key: paramOptional(paramString()),
  block: paramOptional(paramString()),
});

export default definePage({
  key: "block-preview",
  match: "params",
  getId: params => params.id,
  label: "内容预览",
  params: schema.schema,
  component: BlockPreviewView,
});
