/**
 * 浮层外点仲裁（登记制）—— body 级浮层共用的关闭仲裁表（D-014）。
 * 四个语义：
 *  - 外点关闭：pointerdown capture，点在任何 open 层内不算外点；
 *  - 嵌套链：层的触发器落在哪个已开层的 DOM 里即为其子层（Portal 兄弟无法用
 *    contains 判定，靠注册时声明）——点子层保父链，浮层内开的 Menu/Select/二级
 *    Popover 都不误伤；
 *  - 顶层互斥：注册新层时关掉非祖先链的层（点另一个触发器开新浮层，旧的收）；
 *  - 层序分配：登记时按全局开合序递增 zIndex（见 registerDismissLayer 处注释）——
 *    抵消 React 深度优先的 portal 插入序，后开的浮层恒在已开之上。
 *
 * 消费者：Popover / Select（hook 接入）；Menu 的 useMenuTree 保留树语义（整树关闭、
 * 层级导航），其 MenuSurface 只把 el 登记进本表（registerDismissLayer）。
 */

import { useEffect, useRef, type RefObject } from "react";

interface LayerEntry {
  el: HTMLElement;
  isAnchor: (target: Node) => boolean;
  close: () => void;
  parent: LayerEntry | null;
}

interface LayerRegistry {
  layers: LayerEntry[];
  dispose(): void;
}
const registries = new WeakMap<Document, LayerRegistry>();

/** entry 的祖先链（含自身） */
function chainOf(entry: LayerEntry): Set<LayerEntry> {
  const chain = new Set<LayerEntry>();
  let cur: LayerEntry | null = entry;
  while (cur && !chain.has(cur)) {
    chain.add(cur);
    cur = cur.parent;
  }
  return chain;
}

function getRegistry(owner: Document): LayerRegistry {
  const existing = registries.get(owner);
  if (existing) return existing;
  const layers: LayerEntry[] = [];
  const listener = (event: PointerEvent) => {
    const target = event.target as Node;
    const hit = [...layers].reverse().find(layer => layer.el.contains(target));
    if (hit) {
      const keep = chainOf(hit);
      for (const layer of [...layers]) if (!keep.has(layer)) layer.close();
    } else {
      for (const layer of [...layers]) if (!layer.isAnchor(target)) layer.close();
    }
  };
  owner.addEventListener("pointerdown", listener, true);
  const registry = {
    layers,
    dispose: () => {
      owner.removeEventListener("pointerdown", listener, true);
      registries.delete(owner);
    },
  };
  registries.set(owner, registry);
  return registry;
}

export interface RegisterDismissLayerOptions {
  el: HTMLElement;
  /** 触发器判定：点击它不算外点（toggle 由 click 接管）；无触发器的浮层不传 */
  isAnchor?: (target: Node) => boolean;
  close: () => void;
  /** 判定父层用：触发器 el（落在他层 DOM 内即为其子层）；右键浮层等无锚场景传 null */
  anchorEl?: HTMLElement | null;
}

const LAYER_Z_BASE = 250;

function anchorLayer(anchor: HTMLElement | null): number {
  let layer = LAYER_Z_BASE;
  for (let element = anchor; element; element = element.parentElement) {
    const value = Number(element.ownerDocument.defaultView?.getComputedStyle(element).zIndex);
    if (Number.isFinite(value)) layer = Math.max(layer, value);
  }
  return layer;
}

/** 登记一个 open 层；返回注销函数。顶层互斥在注册时执行（关掉非祖先链的层）。 */
export function registerDismissLayer({
  el,
  isAnchor = () => false,
  close,
  anchorEl = null,
}: RegisterDismissLayerOptions): () => void {
  const registry = getRegistry(el.ownerDocument);
  const { layers } = registry;
  el.style.zIndex = String(
    Math.max(
      anchorLayer(anchorEl),
      ...layers.map(layer => Number(layer.el.style.zIndex) || LAYER_Z_BASE)
    ) + 1
  );
  const entry: LayerEntry = {
    el,
    isAnchor,
    close,
    parent: [...layers].reverse().find(l => anchorEl != null && l.el.contains(anchorEl)) ?? null,
  };
  const keep = chainOf(entry);
  for (const l of [...layers]) if (!keep.has(l)) l.close();
  layers.push(entry);
  return () => {
    const i = layers.indexOf(entry);
    if (i > -1) layers.splice(i, 1);
    if (!layers.length) registry.dispose();
  };
}

export interface UseLayerDismissOptions {
  open: boolean;
  layerRef: RefObject<HTMLElement | null>;
  close: () => void;
  /** 触发器判定（应闭包 ref，保持引用稳定——本 hook 不重挂监听） */
  isAnchor: (target: Node) => boolean;
  /** 触发器 el（判父层用，同上经闭包稳定化） */
  getAnchorEl?: () => HTMLElement | null;
}

/** hook 包装：open 期间登记，关闭/卸载注销。close 经 ref 稳定化，调用方可随意重渲。 */
export function useLayerDismiss({
  open,
  layerRef,
  close,
  isAnchor,
  getAnchorEl,
}: UseLayerDismissOptions) {
  const closeRef = useRef(close);
  closeRef.current = close;
  const isAnchorRef = useRef(isAnchor);
  isAnchorRef.current = isAnchor;
  const getAnchorElRef = useRef(getAnchorEl);
  getAnchorElRef.current = getAnchorEl;

  useEffect(() => {
    if (!open) return;
    const el = layerRef.current;
    if (!el) return;
    return registerDismissLayer({
      el,
      isAnchor: t => isAnchorRef.current(t),
      close: () => closeRef.current(),
      anchorEl: getAnchorElRef.current?.() ?? null,
    });
    // layerRef 挂载由 open 驱动（Portal 常驻 / 动态挂载两类都先渲染后进 effect）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
