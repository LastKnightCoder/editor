/** 宿主明确声明旧画布字段的归属；不根据未知插件的字段名猜测持久语义。 */
export interface WhiteboardCanvasType {
  contractId: string;
  previousContractIds?: readonly string[];
  dataProperties?: readonly string[];
  recordProperties?: readonly string[];
  transientProperties?: readonly string[];
  bodyProperty?: string;
}

export function matchesCanvasContract(
  codec: WhiteboardCanvasType | undefined,
  contractId: string
): boolean {
  return (
    !!codec &&
    (codec.contractId === contractId || codec.previousContractIds?.includes(contractId) === true)
  );
}
