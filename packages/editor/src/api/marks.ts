import type { ComponentType, ReactNode } from "react";
import type { Text } from "slate";

export interface MarkRenderProps {
  readonly leaf: Readonly<Text>;
  children: ReactNode;
}

export interface MarkSpec {
  id: string;
  keys: readonly string[];
  /** 只包装 children；Slate 属性及文本承载由核心持有。 */
  render: ComponentType<MarkRenderProps>;
}

export interface RegisteredMark {
  readonly owner: string;
  readonly spec: MarkSpec;
}
