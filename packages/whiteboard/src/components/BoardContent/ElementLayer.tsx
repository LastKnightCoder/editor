import { isValidElement, memo, useCallback, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type Board from "../../Board";
import type { BoardElement, IBoardPlugin } from "../../types";
type VisibleElement = ReturnType<Board["filterElementsInViewport"]>[number];

type Placement = { id: string; parent?: string; frame: boolean };
function move(parent: SVGGElement, node: SVGGElement, before: SVGGElement | null) {
  if (node.parentNode === parent && node.nextSibling === before) return;
  if (node.isConnected && parent.isConnected && typeof parent.moveBefore === "function")
    parent.moveBefore(node, before);
  else parent.insertBefore(node, before);
}

interface ContainerRegistry {
  root: SVGGElement | null;
  container(id: string): SVGGElement;
  frame(id: string, node: SVGGElement): () => void;
  slot(id: string, node: SVGGElement): () => void;
  commit(placements: Placement[]): void;
  suspend(): void;
}

class ElementContainers {
  root: SVGGElement | null = null;
  private portals = new Map<string, SVGGElement>();
  private frames = new Map<string, SVGGElement>();
  private slots = new Map<string, SVGGElement>();
  private children = new Map<string | undefined, string[]>();
  private active = true;

  container(id: string) {
    let node = this.portals.get(id);
    if (!node) {
      node = document.createElementNS("http://www.w3.org/2000/svg", "g");
      node.dataset.elementHost = id;
      this.portals.set(id, node);
    }
    return node;
  }

  frame(id: string, node: SVGGElement) {
    this.frames.set(id, node);
    return () => {
      if (this.frames.get(id) === node) this.frames.delete(id);
    };
  }

  slot(id: string, node: SVGGElement) {
    this.slots.set(id, node);
    this.arrange(node, this.children.get(id) ?? []);
    return () => {
      if (this.slots.get(id) !== node) return;
      // React 删除画框时，子元素的 portal 仍存活，先保持它们连接到同一份文档。
      if (this.active && this.root)
        for (const childId of this.children.get(id) ?? []) {
          const child = this.portals.get(childId);
          if (child?.parentNode === node) move(this.root, child, null);
        }
      this.slots.delete(id);
    };
  }

  private arrange(parent: SVGGElement, ids: string[]) {
    let before: SVGGElement | null = null;
    for (let index = ids.length - 1; index >= 0; index--) {
      const node = this.frames.get(ids[index]) ?? this.portals.get(ids[index]);
      if (!node) continue;
      move(parent, node, before);
      before = node;
    }
  }

  commit(placements: Placement[]) {
    this.active = true;
    const children = new Map<string | undefined, string[]>(),
      portals = new Set<string>();
    for (const placement of placements) {
      const list = children.get(placement.parent) ?? [];
      list.push(placement.id);
      children.set(placement.parent, list);
      if (!placement.frame) portals.add(placement.id);
    }
    this.children = children;
    if (this.root) this.arrange(this.root, children.get(undefined) ?? []);
    for (const [id, slot] of this.slots) this.arrange(slot, children.get(id) ?? []);
    for (const [id, node] of this.portals)
      if (!portals.has(id)) {
        node.remove();
        this.portals.delete(id);
      }
  }

  suspend() {
    this.active = false;
  }
}

function FrameChildren({ containers, id }: { containers: ContainerRegistry; id: string }) {
  const ref = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    if (ref.current) return containers.slot(id, ref.current);
  }, [containers, id]);
  return <g ref={ref} />;
}

const FrameHost = memo(function FrameHost({
  board,
  plugin,
  element,
  containers,
}: {
  board: Board;
  plugin: IBoardPlugin;
  element: BoardElement;
  containers: ContainerRegistry;
}) {
  const ref = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    if (ref.current) return containers.frame(element.id, ref.current);
  }, [containers, element.id]);
  return (
    <g ref={ref}>
      {board.renderPluginElement(plugin, element, [
        <FrameChildren key={element.id} containers={containers} id={element.id} />,
      ])}
    </g>
  );
});

/** 根元素和画框直接子元素共享 React 所有权，分栏等内部结构仍由各自插件渲染。 */
export function ElementLayer({
  board,
  elements,
  liveText,
}: {
  board: Board;
  elements: VisibleElement[];
  liveText: boolean;
}) {
  const ref = useRef<ContainerRegistry | null>(null);
  if (!ref.current) ref.current = new ElementContainers();
  const containers = ref.current;
  const root = useCallback(
    (node: SVGGElement | null) => {
      containers.root = node;
    },
    [containers]
  );
  const placements: Placement[] = [];
  const render = (node: VisibleElement, parent?: string): React.ReactNode => {
    const { element } = node;
    const plugin = board.getPlugin(element.type);
    const frame = !parent && element.type === "frame" && plugin;
    placements.push({ id: element.id, parent, frame: Boolean(frame) });
    if (frame) {
      const visible = board.capabilityService.getVisibleChildren(
        element,
        node.children.map(child => child.element)
      );
      const children = new Map(node.children.map(child => [child.element.id, child]));
      return [
        <FrameHost
          key={element.id}
          board={board}
          plugin={plugin}
          element={element}
          containers={containers}
        />,
        ...visible.flatMap(child => {
          const tree = children.get(child.id);
          return tree ? [render(tree, element.id)] : [];
        }),
      ];
    }
    return createPortal(
      board.renderVisibleElements([node], liveText),
      containers.container(element.id),
      element.id
    );
  };
  const nodes = elements.flatMap(node => {
    const rendered = render(node);
    return Array.isArray(rendered) ? rendered : [rendered];
  });
  useLayoutEffect(() => containers.commit(placements));
  useLayoutEffect(() => () => containers.suspend(), [containers]);
  // React 重插画框组会重载其中的 iframe；绘制顺序由 registry 的保活移动维护。
  const frames = [],
    portals = [];
  for (const node of nodes) {
    if (isValidElement(node) && node.type === FrameHost) frames.push(node);
    else portals.push(node);
  }
  frames.sort((a, b) =>
    String(a.key) < String(b.key) ? -1 : String(a.key) > String(b.key) ? 1 : 0
  );
  return (
    <g ref={root}>
      {frames}
      {portals}
    </g>
  );
}
