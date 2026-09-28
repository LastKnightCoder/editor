/**
 * headless 的 slate 类型增强：只声明 Element / Text。
 * 编辑器的完整增强（types/editor.ts）会带出 slate-react 与 DOM 类型，这里不引用；
 * 两处声明的 Element / Text 相同，同一编译单元里合并不冲突。
 */
import type { CustomElement } from "@tau/editor/src/types/custom-element.ts";
import type { FormattedText } from "@tau/editor/src/types/text.ts";

declare module "slate" {
  interface CustomTypes {
    Element: CustomElement;
    Text: FormattedText;
  }
}
