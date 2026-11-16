import { isContentEmpty } from "@tau/db-schema/content-metrics";
import type { Descendant } from "slate";

/** 卡片正文还是新建时的样子：至多一个只含空文字的段落（有图片、公式等任何元素都不算空） */
export const isBlankCardContent = (content: Descendant[]) =>
  content.length <= 1 && isContentEmpty(content);
