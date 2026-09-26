/** 产物卡片的数据约定（工具与渲染器共用；单独成文件，渲染器注册不牵连执行器） */

import type { GenerateAppKey } from "../appMeta";

export const VL_PRODUCT_RENDERER_KEY = "vibe-learning-product";

/** 写在工具结果的 metadata.render.payload */
export interface VLProductPayload {
  projectId: number;
  kind: GenerateAppKey | "note";
  title: string;
  mode: "generate" | "save";
  taskId?: string;
  noteId?: number;
  quizSetId?: number;
}
