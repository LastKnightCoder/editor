/** 宿主明确声明旧画布字段的归属；不根据未知插件的字段名猜测持久语义。 */
export interface WhiteboardCanvasType {
  contractId: string;
  dataProperties?: readonly string[];
  transientProperties?: readonly string[];
  bodyProperty?: string;
}
