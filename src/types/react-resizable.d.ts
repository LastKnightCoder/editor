declare module "react-resizable" {
  import * as React from "react";

  export interface ResizeCallbackData {
    node: HTMLElement;
    size: {
      width: number;
      height: number;
    };
    handle: string;
  }

  export interface ResizableBoxProps
    extends React.HTMLAttributes<HTMLDivElement> {
    width: number;
    height: number;
    axis?: "both" | "x" | "y" | "none";
    handle?: React.ReactNode;
    minConstraints?: [number, number];
    maxConstraints?: [number, number];
    onResizeStop?: (e: React.SyntheticEvent, data: ResizeCallbackData) => void;
    onResizeStart?: (e: React.SyntheticEvent, data: ResizeCallbackData) => void;
    onResize?: (e: React.SyntheticEvent, data: ResizeCallbackData) => void;
    resizeHandles?: Array<"s" | "w" | "e" | "n" | "sw" | "nw" | "se" | "ne">;
    transformScale?: number;
    draggableOpts?: Record<string, any>;
  }

  export class Resizable extends React.Component<any> {}
  export class ResizableBox extends React.Component<ResizableBoxProps> {}
}
