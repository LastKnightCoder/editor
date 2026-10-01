import type { Descendant, Element } from "slate";

export type CopyDecision = "keep" | "unwrap";

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

type CopiedElement<E extends Element> = E extends Element
  ? Omit<DeepReadonly<E>, "children"> & {
      /** 解包后的片段子节点可能不再满足原元素的完整文档 schema。 */
      readonly children: readonly DeepReadonly<Descendant>[];
    }
  : never;

export interface CopyContext<E extends Element = Element> {
  /** 子节点已处理的冻结片段，不是原文档节点。 */
  readonly element: CopiedElement<E>;
  readonly fullySelected: boolean;
  /** 原节点的祖先类型，从外到内，不含自身。 */
  readonly ancestorTypes: readonly string[];
}

export type ElementCopy<E extends Element = Element> = (context: CopyContext<E>) => CopyDecision;

/** 装配后的有效元素策略；同类型覆盖时连同 owner 一起替换。 */
export interface RegisteredCopy {
  readonly owner: string;
  readonly copy: ElementCopy;
}
