declare module "foliate-js/view.js" {
  export class View extends HTMLElement {
    open(book: unknown): Promise<void>;
    close(): void;
    init(options: {
      lastLocation?: string;
      showTextStart?: boolean;
    }): Promise<void>;
    goTo(target: string | number): Promise<void>;
    goToFraction(fraction: number): Promise<void>;
    goLeft(): Promise<void>;
    goRight(): Promise<void>;
    prev(distance?: number): Promise<void>;
    next(distance?: number): Promise<void>;
    getCFI(index: number, range: Range): string;
    resolveCFI(cfi: string): {
      index: number;
      anchor: (doc: Document) => Range;
    };
    addAnnotation(
      annotation: { value: string; color?: string },
      remove?: boolean,
    ): { index: number; label: string };
    deleteAnnotation(annotation: { value: string }): void;
    book: unknown;
    renderer: {
      setStyles?(css: string): void;
      getContents(): Array<{
        doc: Document;
        index: number;
        overlayer?: unknown;
      }>;
    };
    history: {
      canGoBack: boolean;
      canGoForward: boolean;
      back(): void;
      forward(): void;
      clear(): void;
    };
  }

  export function makeBook(file: File | string): Promise<unknown>;
}

declare module "foliate-js/overlayer.js" {
  export class Overlayer {
    constructor(doc: Document);
    element: SVGElement;
    add(
      key: string,
      range: Range | ((root: Document) => Range),
      draw: DrawFunction,
      options?: DrawOptions,
    ): void;
    remove(key: string): void;
    redraw(): void;
    hitTest(event: { x: number; y: number }): [string, Range] | [];

    static highlight(
      rects: Rect[],
      options?: { color?: string; padding?: number },
    ): SVGElement;
    static underline(
      rects: Rect[],
      options?: {
        color?: string;
        width?: number;
        padding?: number;
        writingMode?: string;
      },
    ): SVGElement;
    static strikethrough(
      rects: Rect[],
      options?: { color?: string; width?: number; writingMode?: string },
    ): SVGElement;
    static squiggly(
      rects: Rect[],
      options?: {
        color?: string;
        width?: number;
        padding?: number;
        writingMode?: string;
      },
    ): SVGElement;
    static outline(
      rects: Rect[],
      options?: {
        color?: string;
        width?: number;
        padding?: number;
        radius?: number;
      },
    ): SVGElement;
    static copyImage(rects: [Rect], options?: { src: string }): SVGElement;
  }

  interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  }

  type DrawFunction = (rects: Rect[], options?: DrawOptions) => SVGElement;
  type DrawOptions = Record<string, unknown>;
}

declare module "foliate-js/epubcfi.js" {
  export function isCFI(str: string): boolean;
  export function parse(cfi: string): unknown;
  export function fromRange(range: Range): string;
  export function toRange(doc: Document, parts: unknown): Range;
  export function joinIndir(base: string, relative: string): string;
  export function fromCalibreHighlight(obj: unknown): string;
  export const fake: {
    fromIndex(index: number): string;
    toIndex(parts: unknown): number;
  };
}
