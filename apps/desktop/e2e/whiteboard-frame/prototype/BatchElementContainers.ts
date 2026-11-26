interface FramePresentation {
  hasRoot(id: string): boolean;
  registerPaintGroup(id: string, group: SVGGElement): () => void;
}

interface Placement {
  id: string;
  parent?: string;
  frame: boolean;
}

interface ContainerRegistry {
  root: SVGGElement | null;
  container(id: string): SVGGElement;
  frame(id: string, node: SVGGElement): () => void;
  slot(id: string, node: SVGGElement): () => void;
  commit(placements: Placement[]): void;
  suspend(): void;
}

function moveContainer(parent: SVGGElement, node: SVGGElement, before: SVGGElement | null) {
  if (node.parentNode === parent && node.nextSibling === before) return;
  if (node.isConnected && parent.isConnected && typeof parent.moveBefore === "function")
    parent.moveBefore(node, before);
  else parent.insertBefore(node, before);
}

interface Batch {
  node: SVGGElement;
  members: string[];
}
interface Location {
  parent?: string;
  index: number;
}

/** 绘制组只承载连续的 portal 宿主，不改变 React 所有权或逻辑父子树。 */
export class BatchElementContainers implements ContainerRegistry {
  root: SVGGElement | null = null;
  private portals = new Map<string, SVGGElement>();
  private frames = new Map<string, SVGGElement>();
  private slots = new Map<string, SVGGElement>();
  private batches = new Set<Batch>();
  private units = new Map<string | undefined, SVGGElement[]>();
  private active = true;
  private paintBindings = new Map<SVGGElement, { id?: string; release?: () => void }>();
  private flatParents = new Set<string>();

  constructor(private readonly presentation: FramePresentation) {}

  private bindPaint() {
    const current = new Set<SVGGElement>();
    for (const [id, units] of this.units)
      for (const unit of units) {
        if (!unit.hasAttribute("data-element-batch")) continue;
        current.add(unit);
        const parent = id !== undefined && this.flatParents.has(id) ? id : undefined;
        const binding = this.paintBindings.get(unit);
        if (binding && binding.id === parent) continue;
        binding?.release?.();
        unit.style.willChange = "transform";
        unit.style.transform = "translate3d(0px, 0px, 0)";
        const release =
          parent === undefined ? undefined : this.presentation.registerPaintGroup(parent, unit);
        this.paintBindings.set(unit, { id: parent, release });
      }
    for (const [unit, binding] of this.paintBindings)
      if (!current.has(unit)) {
        binding.release?.();
        this.paintBindings.delete(unit);
      }
  }

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
    if (!this.flatParents.has(id)) this.arrange(node, this.units.get(id) ?? []);
    return () => {
      if (this.slots.get(id) !== node) return;
      // 解散时整组保持连接，不能等 React 删除画框后再恢复正文和 iframe。
      if (!this.flatParents.has(id) && this.active && this.root)
        for (const unit of this.units.get(id) ?? [])
          if (unit.parentNode === node) moveContainer(this.root, unit, null);
      this.slots.delete(id);
    };
  }

  private arrange(parent: SVGGElement, nodes: SVGGElement[]) {
    let anchor = -1;
    for (let index = 0; index < nodes.length; index++)
      if (
        nodes[index].parentNode === parent &&
        nodes[index].hasAttribute("data-element-batch") &&
        (anchor < 0 || nodes[index].childElementCount > nodes[anchor].childElementCount)
      )
        anchor = index;
    // 新画框插到已有绘制组之前，不能为调整顺序搬动整片正文。
    let before: SVGGElement | null = null;
    for (let index = nodes.length - 1; index >= 0; index--) {
      if (index === anchor) {
        before = nodes[index];
        continue;
      }
      moveContainer(parent, nodes[index], before);
      before = nodes[index];
    }
  }

  commit(placements: Placement[]) {
    this.active = true;
    const locations = new Map<string, Location>(),
      lists = new Map<string | undefined, Placement[]>();
    for (const placement of placements) {
      const list = lists.get(placement.parent) ?? [];
      if (!placement.frame)
        locations.set(placement.id, { parent: placement.parent, index: list.length });
      list.push(placement);
      lists.set(placement.parent, list);
    }
    const retained = new Map<string, Batch>(),
      kept = new Set<Batch>();
    for (const batch of this.batches) {
      let run: string[] = [],
        largest: string[] = [],
        previous: Location | undefined;
      for (const id of batch.members) {
        const location = locations.get(id);
        if (!location) continue;
        if (
          !previous ||
          previous.parent !== location.parent ||
          previous.index + 1 !== location.index
        )
          run = [];
        run.push(id);
        if (run.length > largest.length) largest = run;
        previous = location;
      }
      if (!largest.length) continue;
      batch.members = largest;
      kept.add(batch);
      largest.forEach(id => retained.set(id, batch));
    }
    const units = new Map<string | undefined, SVGGElement[]>();
    this.flatParents = new Set(
      [...lists.keys()].filter(
        (id): id is string => id !== undefined && this.presentation.hasRoot(id)
      )
    );
    for (const [parentId, list] of lists) {
      const parent =
        parentId === undefined || this.flatParents.has(parentId)
          ? this.root
          : this.slots.get(parentId);
      if (!parent) continue;
      const nodes: SVGGElement[] = [];
      for (let index = 0; index < list.length;) {
        const placement = list[index];
        if (placement.frame) {
          const frame = this.frames.get(placement.id);
          if (frame) nodes.push(frame);
          index++;
          continue;
        }
        const existing = retained.get(placement.id);
        if (existing) {
          nodes.push(existing.node);
          index += existing.members.length;
          continue;
        }
        const members: string[] = [];
        while (index < list.length && !list[index].frame && !retained.has(list[index].id))
          members.push(list[index++].id);
        const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
        node.dataset.elementBatch = "";
        const batch = { node, members };
        kept.add(batch);
        // 新组先连到文档，再搬入存活宿主，浏览器才能保留焦点和嵌入页状态。
        moveContainer(parent, node, null);
        for (const id of members) {
          const host = this.portals.get(id);
          if (host) moveContainer(node, host, null);
        }
        nodes.push(node);
      }
      units.set(parentId, nodes);
    }
    {
      const rootUnits: SVGGElement[] = [];
      const frameIds = new Map([...this.frames].map(([id, node]) => [node, id]));
      for (const unit of units.get(undefined) ?? []) {
        rootUnits.push(unit);
        const frameId = frameIds.get(unit);
        if (frameId !== undefined && this.flatParents.has(frameId))
          rootUnits.push(...(units.get(frameId) ?? []));
      }
      if (this.root) this.arrange(this.root, rootUnits);
    }
    for (const [id, slot] of this.slots)
      if (!this.flatParents.has(id)) this.arrange(slot, units.get(id) ?? []);
    for (const batch of this.batches) if (!kept.has(batch)) batch.node.remove();
    for (const [id, host] of this.portals)
      if (!locations.has(id)) {
        host.remove();
        this.portals.delete(id);
      }
    this.batches = kept;
    this.units = units;
    this.bindPaint();
  }

  suspend() {
    this.active = false;
    for (const binding of this.paintBindings.values()) binding.release?.();
    this.paintBindings.clear();
  }
}
