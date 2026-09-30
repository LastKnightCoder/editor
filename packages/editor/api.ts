// @tau/editor/api：扩展作者的唯一入口，实现见 src/api
export * from "./src/api";
/** 扩展包通过模块增强登记元素；不要求内核知道包名或实现文件。 */
declare const extensionElementMapBrand: unique symbol;
declare const extensionInlineElementMapBrand: unique symbol;
export interface ExtensionElementMap {
  [extensionElementMapBrand]: never;
}
export interface ExtensionInlineElementMap {
  [extensionInlineElementMapBrand]: never;
}
