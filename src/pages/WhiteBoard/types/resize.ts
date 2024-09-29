export enum EHandlerPosition {
  TopLeft = 'top-left',
  TopRight = 'top-right',
  BottomLeft = 'bottom-left',
  BottomRight = 'bottom-right',
  Left = 'left',
  Right = 'right',
  Top = 'top',
  Bottom = 'bottom'
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
