/**
 * headless 只声明共用的文本标记；元素由消费端的 Slate 类型增强决定。
 * 框架不引用编辑器的联合元素类型或 React/DOM 增强。
 */
import type { FormattedText } from "./model.ts";

declare module "slate" {
  interface CustomTypes {
    Text: FormattedText;
  }
}
