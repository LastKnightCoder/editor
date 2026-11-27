import { WHITEBOARD_LIMITS } from "@tau/collaboration";
import type {
  ContentNode,
  WhiteboardElementSnapshot,
  WhiteboardModel,
  WhiteboardModelCommand,
  WhiteboardPageSnapshot,
} from "@tau/collaboration";
import {
  markdownLineToText,
  normalizeTree,
  reconcileRanges,
  shrinkRangesBeforeRemoval,
  type MindNodeElement,
} from "@tau/whiteboard/mindmap";
import {
  mindError,
  mindErrorDetails,
  mindFieldValue,
  mindIndex,
  mindStructure,
  mindObject,
  mindString,
  mindId,
  mindEnum,
  mindKeys,
  mindCapabilities,
  isSingleMindLayout,
  type MindField,
} from "../../../../shared/whiteboard-mindmap";
import {
  pageElements,
  endpointId,
  type AgentBoardRequest,
} from "../../../../shared/whiteboard-agent";
import { hash, equal, type Contracts, type Placement, type Operation } from "./mindmap-agent-utils";
import { insertMindNodes } from "./mindmap-insert";
import { editMindText } from "./mindmap-text";
import { moveMindNode, copyMindBranch, removeMindNodes } from "./mindmap-structure";
import { foldMindNodes, configureMindmap } from "./mindmap-presentation";
import { editMindRange, editMindRelation, setMindNote } from "./mindmap-annotations";

export class MindmapAgentCandidate {
  private readonly base: WhiteboardPageSnapshot;

  private readonly guarded = new Set<string>();

  private readonly initial = new Set<string>();

  private readonly createdIds: Set<string>;

  private readonly baseIndex: ReturnType<typeof mindIndex>;

  private operationKind = "";

  constructor(
    readonly model: WhiteboardModel,
    readonly request: AgentBoardRequest,
    readonly ids: Map<string, string>,
    readonly contracts: Contracts,
    readonly noteReference?: (
      contentId: number
    ) => import("@tau/db-schema/content-identities").ContentEntityReference,
    readonly resolveNote?: (
      entity: import("@tau/db-schema/content-identities").ContentEntityReference
    ) => number | null
  ) {
    this.base = this.page();
    this.baseIndex = mindIndex(this.base);
    this.baseIndex.nodes.forEach(node => this.initial.add(node.id));
    this.createdIds = new Set(ids.values());
  }

  page() {
    const page = this.model.read().pages.find(page => page.id === this.request.pageId);
    if (!page)
      mindError("PAGE_UNAVAILABLE", "目标白板页已移除", {
        retry: "refresh_context",
        suggestion: "重新调用 get_whiteboard_context 获取当前页，再读取导图。",
      });
    return page;
  }

  lookup(value: unknown, path: string) {
    const id = mindId(value, path);
    return this.ids.get(id) ?? id;
  }

  node(value: unknown, path = "id", mind = true) {
    const id = this.lookup(value, path);
    const node = mindIndex(this.page()).nodes.get(id);
    if (!node)
      mindError("ELEMENT_NOT_FOUND", `找不到元素 ${id}，或它已不在当前页`, {
        path,
        elementIds: [id],
        actual: null,
        retry: "reread",
        suggestion: "重新读取当前页导图；本批临时 ID 只能引用在前面已创建的节点。",
      });
    if (
      (mind && node.type !== "mind-node") ||
      this.contracts.builtins.types[node.type]?.contractId !== node.contractId
    )
      mindError(
        "UNSUPPORTED_ELEMENT",
        `元素 ${id} 不是可编辑的原生${mind ? "思维导图节点" : "白板元素"}`,
        {
          path,
          elementIds: [id],
          expected: mind ? "mind-node" : "受支持的内置元素契约",
          actual: { type: node.type, contractId: node.contractId },
          suggestion: "使用 read_whiteboard_mindmap 返回的原生节点 ID；不要用文本框代替导图节点。",
        }
      );
    return node;
  }

  /** 正文范围编辑只读取绑定页中的原生身份，不为每个字符操作重建整页投影。 */
  textTarget(value: unknown) {
    const id = this.lookup(value, "id");
    const identity =
      this.initial.has(id) || this.createdIds.has(id)
        ? this.model.readElementIdentity(id)
        : undefined;
    if ((!this.initial.has(id) && !this.createdIds.has(id)) || !identity)
      mindError("ELEMENT_NOT_FOUND", `找不到当前页中可编辑的节点 ${id}`, {
        path: "id",
        elementIds: [id],
        actual: null,
        retry: "reread",
        suggestion: "使用当前页读取的节点 ID；已删除、其他页或尚未创建的节点不能编辑。",
      });
    if (
      identity.type !== "mind-node" ||
      identity.contractId !== this.contracts.builtins.types["mind-node"].contractId
    )
      mindError("UNSUPPORTED_ELEMENT", "正文目标不是可编辑的原生导图节点", {
        path: "id",
        elementIds: [id],
        expected: "mind-node",
        actual: identity,
        suggestion: "导图节点使用本工具，其他白板元素使用对应编辑工具。",
      });
    return { id };
  }

  guard(id: string, ...fields: MindField[]) {
    if (!this.initial.has(id)) return;
    const before = this.request.preconditions?.find(item => item.id === id);
    for (const field of fields) {
      const key = `${id}:${field}`;
      if (this.guarded.has(key)) continue;
      if (!before || typeof before[field] !== "string")
        mindError("READ_REQUIRED", `修改元素 ${id} 前缺少 ${field} 读取凭据`, {
          path: "preconditions",
          elementIds: [id],
          expected: { id, field },
          actual: before ?? null,
          retry: "reread",
          suggestion:
            "先调用 read_whiteboard_mindmap 读取目标及其父节点，将返回的 preconditions 原样传回。",
        });
      const current = mindFieldValue(this.base, id, field, this.baseIndex);
      const actual = hash(current);
      if (before[field] !== actual)
        mindError("PRECONDITION_CONFLICT", `元素 ${id} 的 ${field} 已变化，本批未提交`, {
          path: `preconditions.${id}.${field}`,
          elementIds: [id],
          expected: { hash: before[field] },
          actual: {
            hash: actual,
            current:
              JSON.stringify(current).length <= 4096
                ? current
                : { truncated: true, preview: JSON.stringify(current).slice(0, 4096) },
          },
          retry: "reread",
          suggestion:
            "重新读取该节点及父节点，基于最新结果调整操作，并使用新的 requestId；不要覆盖他人的修改。",
        });
      this.guarded.add(key);
    }
  }

  submit(commands: WhiteboardModelCommand[]) {
    if (commands.length)
      this.model.submitChunks(commands, "agent", [
        ...this.contracts.builtins.prepared.filter(entry =>
          ["mind-node", "arrow"].includes(entry.contract.type)
        ),
        this.contracts.paragraph,
        this.contracts.link,
      ]);
  }

  created(value: unknown) {
    const alias = mindId(value, "id");
    const id = this.ids.get(alias);
    if (!id)
      mindError("INVALID_CREATE_ID", "创建操作必须使用本批唯一的临时 id", {
        path: "id",
        actual: alias,
      });
    if (mindIndex(this.page()).nodes.has(id) || this.initial.has(alias))
      mindError("DUPLICATE_ID", "临时 id 与已有或本批已创建的元素重复", {
        path: "id",
        actual: alias,
      });
    return id;
  }

  body(value: unknown, markdown = false): ContentNode[] {
    if (typeof value === "string") {
      const text = mindString(value, "text");
      if (markdown) return markdownLineToText(text).map(node => this.contentNode(node));
      return [
        { type: "paragraph", tauContract: this.contracts.paragraph.id, children: [{ text }] },
      ];
    }
    if (!Array.isArray(value) || !value.length)
      mindError("INVALID_CONTENT", "content 必须是非空正文节点数组", {
        path: "content",
        actual: value,
      });
    return value.map(node => this.contentNode(node));
  }

  private contentNode(value: unknown): ContentNode {
    const node = mindObject(value, "content");
    const rest = { ...node };
    delete rest.collabId;
    if (typeof node.text === "string") return { ...rest, text: node.text };
    if (!Array.isArray(node.children))
      mindError("INVALID_CONTENT", "正文元素缺少 children 数组", {
        path: "content.children",
        actual: node,
      });
    const prepared =
      node.type === "paragraph"
        ? this.contracts.paragraph
        : node.type === "link"
          ? this.contracts.link
          : undefined;
    const supplied = typeof node.tauContract === "string" ? node.tauContract : undefined;
    if (!prepared && (!supplied || !this.model.contracts.has(supplied)))
      mindError("UNSUPPORTED_CONTENT", "正文元素缺少当前文档可识别的精确契约", {
        path: "content.tauContract",
        actual: { type: node.type, tauContract: supplied },
        suggestion:
          "新正文可使用 paragraph、link 和文字叶节点；保留复杂正文时使用读取的 content 与契约。",
      });
    return {
      ...rest,
      tauContract: supplied ?? prepared?.id,
      children: node.children.map(child => this.contentNode(child)),
    };
  }

  root(node: WhiteboardElementSnapshot) {
    const index = mindIndex(this.page());
    const id = index.roots.get(node.id);
    if (!id)
      mindError("ROOT_NOT_FOUND", "无法确定该节点所属导图", {
        elementIds: [node.id],
        retry: "reread",
        suggestion: "重新读取节点所在导图。",
      });
    return this.node(id);
  }

  placement(op: Operation, source?: WhiteboardElementSnapshot): Placement {
    if (op.beforeId !== undefined && op.afterId !== undefined)
      mindError("AMBIGUOUS_POSITION", "beforeId 与 afterId 不能同时提供", {
        path: "beforeId",
        expected: "二选一",
      });
    const index = mindIndex(this.page());
    const anchorId = op.beforeId ?? op.afterId;
    const anchor =
      anchorId !== undefined
        ? this.node(anchorId, op.beforeId !== undefined ? "beforeId" : "afterId")
        : undefined;
    const inferred = anchor && index.parents.get(anchor.id);
    const parent = op.parentId !== undefined ? this.node(op.parentId, "parentId", false) : inferred;
    if (parent && parent.type !== "mind-node" && parent.type !== "frame")
      mindError("INVALID_PARENT", "导图只能挂到原生导图节点或画框下", {
        path: "parentId",
        elementIds: [parent.id],
        actual: parent.type,
        expected: ["mind-node", "frame"],
      });
    if (anchor && inferred?.id !== parent?.id)
      mindError("ANCHOR_PARENT_MISMATCH", "插入位置与目标父节点不属于同一组兄弟", {
        path: "parentId",
        elementIds: [anchor.id],
        expected: inferred?.id ?? this.page().id,
        actual: parent?.id ?? this.page().id,
      });
    if (parent)
      this.guard(parent.id, "structure", ...(parent.type === "mind-node" ? ["fold" as const] : []));
    if (anchor) this.guard(anchor.id, "structure");
    let direction: "left" | "right" =
      op.side === undefined
        ? ((anchor && index.sides.get(anchor.id)) ??
          (parent && index.sides.get(parent.id)) ??
          "right")
        : mindEnum(op.side, ["left", "right"], "side");
    if (parent?.type === "mind-node") {
      const root = this.root(parent);
      const depth = index.depths.get(parent.id) ?? 1;
      const effective = index.sides.get(parent.id) ?? "right";
      const sides = isSingleMindLayout(root.data.layout)
        ? ["right"]
        : depth === 1
          ? ["left", "right"]
          : [effective];
      if (op.side !== undefined && !sides.includes(direction))
        mindError("SIDE_NOT_SUPPORTED", "指定方向与当前布局或父分支方向不符", {
          path: "side",
          elementIds: [parent.id, root.id],
          expected: sides,
          actual: direction,
          suggestion:
            depth === 1
              ? "省略 side 按当前布局插入；需要左右布局时先显式 configure layout=mind。"
              : "子分支沿父分支展开；要换边请移动所属的一级分支。",
        });
      if (depth > 1) direction = effective;
      else if (isSingleMindLayout(root.data.layout)) direction = "right";
      if (source) {
        const descendants = new Set(pageElements([source]).map(node => node.id));
        if (descendants.has(parent.id))
          mindError("CYCLE_DETECTED", "不能把节点挂到自身或其后代下", {
            path: "parentId",
            elementIds: [source.id, parent.id],
            suggestion: "改选子树之外的父节点；原分支保持不变。",
          });
      }
    }
    return {
      parent: parent ? { kind: "element", id: parent.id } : { kind: "page", id: this.page().id },
      direction,
      ...(op.beforeId !== undefined && anchor
        ? { beforeId: anchor.id }
        : op.afterId !== undefined && anchor
          ? { afterId: anchor.id }
          : {}),
    };
  }

  expandParent(placement: Placement) {
    if (placement.parent.kind !== "element") return;
    const parent = this.node(placement.parent.id, "parentId", false);
    if (parent.type !== "mind-node") return;
    const root = this.root(parent);
    this.submit([
      {
        type: "set_data",
        id: parent.id,
        patch: isSingleMindLayout(root.data.layout)
          ? { isLeftFold: false, isRightFold: false }
          : { [placement.direction === "left" ? "isLeftFold" : "isRightFold"]: false },
      },
    ]);
  }

  syncRanges(root: MindNodeElement, originals: Map<string, WhiteboardElementSnapshot>) {
    const commands: WhiteboardModelCommand[] = [];
    const walk = (node: MindNodeElement) => {
      const old = originals.get(node.id);
      if (old) {
        if (!equal(old.data.summaryRange, node.summaryRange))
          commands.push({
            type: "set_data",
            id: node.id,
            patch: node.summaryRange ? { summaryRange: { ...node.summaryRange } } : {},
            ...(node.summaryRange ? {} : { unset: ["summaryRange"] }),
          });
        const before = Array.isArray(old.data.boundaries) ? old.data.boundaries : [];
        const after = (node.boundaries ?? []).map(boundary => ({ ...boundary }));
        if (!equal(before, after))
          commands.push({ type: "patch_records", id: node.id, field: "boundaries", before, after });
      }
      node.children.forEach(walk);
    };
    walk(root);
    this.submit(commands);
  }

  detachRanges(node: WhiteboardElementSnapshot) {
    const page = this.page(),
      index = mindIndex(page),
      parent = index.parents.get(node.id);
    if (!parent || parent.type !== "mind-node") return new Set<string>();
    this.guard(parent.id, "structure");
    const root = this.root(node),
      tree = mindStructure(root),
      removed = new Set([node.id]);
    const visit = (current: MindNodeElement) => {
      if (current.id === parent.id)
        shrinkRangesBeforeRemoval(current, removed, !isSingleMindLayout(root.data.layout));
      current.children.forEach(visit);
    };
    visit(tree);
    this.syncRanges(tree, index.nodes);
    removed.delete(node.id);
    return removed;
  }

  removeIds(ids: Set<string>) {
    const nodes = [...mindIndex(this.page()).nodes.values()];
    for (const id of [...ids]) {
      const node = nodes.find(node => node.id === id);
      if (node) pageElements([node]).forEach(child => ids.add(child.id));
    }
    const removedRelations = nodes.filter(
      node =>
        node.type === "arrow" &&
        [endpointId(node.data.source), endpointId(node.data.target)].some(id => id && ids.has(id))
    );
    removedRelations.forEach(node => ids.add(node.id));
    if (ids.size) this.submit([{ type: "remove_nodes", ids: [...ids] }]);
  }

  point(value: unknown, path: string) {
    const point = mindObject(value, path);
    mindKeys(point, ["x", "y"], path);
    const number = (key: string) => {
      const n = point[key];
      if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1e9)
        mindError("INVALID_ARGUMENT", `${path}.${key} 必须是有限坐标`, {
          path: `${path}.${key}`,
          actual: n,
        });
      return n;
    };
    return { x: number("x"), y: number("y") };
  }

  async execute() {
    await this.model.installContracts({
      [this.contracts.paragraph.id]: this.contracts.paragraph.contract,
      [this.contracts.link.id]: this.contracts.link.contract,
    });
    for (const [index, op] of this.request.operations.entries()) {
      this.operationKind = String(op.kind);
      try {
        if (op.kind === "insert") await insertMindNodes(this, op);
        else if (op.kind === "edit_text") editMindText(this, op);
        else if (op.kind === "move") moveMindNode(this, op);
        else if (op.kind === "copy") copyMindBranch(this, op);
        else if (op.kind === "remove") removeMindNodes(this, op);
        else if (op.kind === "fold") foldMindNodes(this, op);
        else if (op.kind === "configure") configureMindmap(this, op);
        else if (op.kind === "summary" || op.kind === "boundary") editMindRange(this, op);
        else if (op.kind === "relation") editMindRelation(this, op);
        else if (op.kind === "note") setMindNote(this, op);
        else
          mindError("UNKNOWN_OPERATION", "不支持的导图操作", {
            path: "kind",
            actual: op.kind,
            expected: mindCapabilities.operations,
          });
      } catch (error) {
        const details = mindErrorDetails(error);
        const message =
          details?.message ?? (error instanceof Error ? error.message : String(error));
        const budget = !details && /超过预算|超限|超过.*(?:限额|预算)|容量|层级过深/.test(message);
        mindError(details?.code ?? (budget ? "LIMIT_EXCEEDED" : "OPERATION_REJECTED"), message, {
          ...details,
          operationIndex: index,
          operationKind: this.operationKind,
          path: `operations[${index}]${details?.path ? "." + details.path : ""}`,
          commitStatus: "not_applied",
          ...(budget
            ? {
                expected: WHITEBOARD_LIMITS,
                actual: {
                  operationKind: this.operationKind,
                  operationsInBatch: this.request.operations.length,
                },
                suggestion: /层级/.test(message)
                  ? "减少嵌套层级或改为同级分支；重读不会解除层级限额。修正后使用新的 requestId。"
                  : /富文本根/.test(message)
                    ? "减少新建或复制的带正文节点，已有节点仍可修改。重读不会增加正文额度；修正后使用新的 requestId。"
                    : "减少新增内容或批次规模，并核对文档、元素和正文额度；重读不会解除容量限制。修正后使用新的 requestId。",
                retry: "fix_arguments" as const,
              }
            : !details
              ? {
                  suggestion:
                    "本批没有提交。根据错误原因调整该操作；如涉及现有节点，先重新读取其结构和正文。",
                  retry: "reread" as const,
                }
              : {}),
        });
      }
    }
    for (const node of this.page().children) this.reconcile(node);
  }

  private reconcile(node: WhiteboardElementSnapshot) {
    if (node.type !== "mind-node") {
      node.children.forEach(child => this.reconcile(child));
      return;
    }
    const tree = mindStructure(node);
    reconcileRanges(tree, !isSingleMindLayout(node.data.layout));
    normalizeTree(tree, isSingleMindLayout(node.data.layout));
    this.syncRanges(tree, mindIndex(this.page()).nodes);
  }
}
