/**
 * cropperjs Web Components 类型定义
 * cropperjs 使用原生 Web Components,这里为它们添加 TypeScript 类型支持
 */

// CropperCanvas 元素
export interface CropperCanvasElement extends HTMLElement {
  $setAction?: (action: string) => void;
  $toCanvas?: (options?: {
    width?: number;
    height?: number;
    beforeDraw?: (ctx: CanvasRenderingContext2D) => void;
  }) => Promise<HTMLCanvasElement>;
}

// CropperImage 元素
export interface CropperImageElement extends HTMLElement {
  $ready?: (callback: () => void) => void;
  $move?: (x: number, y: number) => void;
  $rotate?: (angle: number, x?: number, y?: number) => void;
  $zoom?: (scale: number, x?: number, y?: number) => void;
  $scale?: (x: number, y: number) => void;
  $skew?: (x: number, y: number) => void;
  $transform?: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => void;
  $getTransform?: () => DOMMatrix | null;
  $setTransform?: (values: {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  }) => void;
  $resetTransform?: () => void;
  $center?: (size?: string) => void;
}

// CropperSelection 元素
export interface CropperSelectionElement extends HTMLElement {
  $center?: () => void;
  $moveTo?: (x: number, y: number) => void;
  $move?: (x: number, y: number) => void;
  $resize?: (
    action: string,
    offsetX: number,
    offsetY: number,
    aspectRatio?: number,
  ) => void;
  $zoom?: (scale: number, x?: number, y?: number) => void;
  $change?: (
    x: number,
    y: number,
    width: number,
    height: number,
    aspectRatio?: number,
  ) => void;
  $reset?: () => void;
  $clear?: () => void;
  $render?: () => void;
  $toCanvas?: (options?: {
    width?: number;
    height?: number;
    beforeDraw?: (ctx: CanvasRenderingContext2D) => void;
  }) => Promise<HTMLCanvasElement>;
}

// CropperGrid 元素
export type CropperGridElement = HTMLElement;

// CropperCrosshair 元素
export type CropperCrosshairElement = HTMLElement;

// CropperShade 元素
export interface CropperShadeElement extends HTMLElement {
  $change?: (x: number, y: number, width?: number, height?: number) => void;
  $reset?: () => void;
  $render?: () => void;
}

// CropperHandle 元素
export type CropperHandleElement = HTMLElement;

// 声明全局 JSX 元素
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "cropper-canvas": React.DetailedHTMLProps<
        React.HTMLAttributes<CropperCanvasElement>,
        CropperCanvasElement
      >;
      "cropper-image": React.DetailedHTMLProps<
        React.HTMLAttributes<CropperImageElement>,
        CropperImageElement
      >;
      "cropper-selection": React.DetailedHTMLProps<
        React.HTMLAttributes<CropperSelectionElement>,
        CropperSelectionElement
      >;
      "cropper-grid": React.DetailedHTMLProps<
        React.HTMLAttributes<CropperGridElement>,
        CropperGridElement
      >;
      "cropper-crosshair": React.DetailedHTMLProps<
        React.HTMLAttributes<CropperCrosshairElement>,
        CropperCrosshairElement
      >;
      "cropper-shade": React.DetailedHTMLProps<
        React.HTMLAttributes<CropperShadeElement>,
        CropperShadeElement
      >;
      "cropper-handle": React.DetailedHTMLProps<
        React.HTMLAttributes<CropperHandleElement>,
        CropperHandleElement
      >;
    }
  }
}
