/** 扩展通过纯类型入口增强标记字段，框架不拥有具体格式。 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface -- 用于扩展的模块增强
export interface TextMarkMap {}

export interface FormattedText extends TextMarkMap {
  type: "formatted";
  text: string;
}
