/**
 * 树谱视图的布局（M4-d）：主进程给的用户消息树 → 面板逐行渲染的行。纯函数，可单测。
 *
 * - 没有分叉的直链压成一段：只画段首，段内条数写在旁边（长对话不至于画出几百行）；
 * - 分叉点下的子分支按「当前路径所在的在前，其余按最后活动时间倒序」排；
 * - 每个分支末端带进度：这条分支从分叉点起问了几轮、最后活动时间、是否在当前路径上。
 */
import type { ConversationTreeNode } from "@/types/pi-session";

export interface ConversationTreeRow {
  /** 段首节点（点击切到这条分支） */
  node: ConversationTreeNode;
  /** 缩进层级（分叉一次 +1） */
  depth: number;
  /** 本段共几条用户消息（含段首） */
  length: number;
  /** 本段最后一个节点：切到这个分支时落到它 */
  tail: ConversationTreeNode;
  /** 本段是分叉出来的（段首有兄弟） */
  isBranch: boolean;
  /** 本段在当前路径上 */
  onPath: boolean;
  /** 本段末端就是叶子（没有更后面的消息）：显示进度 */
  isLeaf: boolean;
  /** 从这一段起到叶子（沿最近活动）的用户消息总数：分支进度 */
  turnsToLeaf: number;
  /** 这条分支最后活动时间 */
  lastActive: number;
}

export interface ConversationTreeSummary {
  rows: ConversationTreeRow[];
  /** 叶子数 = 分支数（没有分叉时为 1） */
  branchCount: number;
  /** 后面分了叉的用户消息 id（它之后有多条不同的下一问） */
  forkPoints: Set<string>;
}

export function layoutConversationTree(nodes: ConversationTreeNode[]): ConversationTreeSummary {
  const children = new Map<string | null, ConversationTreeNode[]>();
  for (const node of nodes) {
    const list = children.get(node.parentId) ?? [];
    list.push(node);
    children.set(node.parentId, list);
  }

  // 子树的最后活动时间与「沿最近活动走到叶子」的长度：一遍后序，迭代避免深链爆栈
  const lastActive = new Map<string, number>();
  const depthToLeaf = new Map<string, number>();
  const onPathBelow = new Map<string, boolean>();
  const order: ConversationTreeNode[] = [];
  const stack = [...(children.get(null) ?? [])];
  while (stack.length > 0) {
    const node = stack.pop()!;
    order.push(node);
    stack.push(...(children.get(node.id) ?? []));
  }
  for (const node of order.reverse()) {
    const kids = children.get(node.id) ?? [];
    let latest = node.time;
    let latestKid: ConversationTreeNode | undefined;
    let latestKidTime = -Infinity;
    let pathBelow = node.onPath;
    for (const kid of kids) {
      const kidLatest = lastActive.get(kid.id) ?? kid.time;
      if (kidLatest > latestKidTime) {
        latestKid = kid;
        latestKidTime = kidLatest;
      }
      latest = Math.max(latest, kidLatest);
      pathBelow = pathBelow || Boolean(onPathBelow.get(kid.id));
    }
    lastActive.set(node.id, latest);
    depthToLeaf.set(node.id, 1 + (latestKid ? (depthToLeaf.get(latestKid.id) ?? 0) : 0));
    onPathBelow.set(node.id, pathBelow);
  }

  const sortSiblings = (list: ConversationTreeNode[]) =>
    [...list].sort((a, b) => {
      const pathA = onPathBelow.get(a.id) ? 1 : 0;
      const pathB = onPathBelow.get(b.id) ? 1 : 0;
      if (pathA !== pathB) return pathB - pathA;
      return (lastActive.get(b.id) ?? 0) - (lastActive.get(a.id) ?? 0);
    });

  const rows: ConversationTreeRow[] = [];
  const forkPoints = new Set<string>();
  let branchCount = 0;
  const roots = sortSiblings(children.get(null) ?? []);
  // 深度优先按行输出；栈里放「段首 + 层级 + 是否分叉出来」
  const pending: Array<{ node: ConversationTreeNode; depth: number; isBranch: boolean }> = roots
    .map(node => ({ node, depth: roots.length > 1 ? 1 : 0, isBranch: roots.length > 1 }))
    .reverse();
  while (pending.length > 0) {
    const { node: head, depth, isBranch } = pending.pop()!;
    let tail = head;
    let length = 1;
    let kids = children.get(tail.id) ?? [];
    while (kids.length === 1) {
      tail = kids[0];
      length += 1;
      kids = children.get(tail.id) ?? [];
    }
    const isLeaf = kids.length === 0;
    if (isLeaf) branchCount += 1;
    else forkPoints.add(tail.id);
    rows.push({
      node: head,
      depth,
      length,
      tail,
      isBranch,
      onPath: Boolean(onPathBelow.get(head.id)),
      isLeaf,
      turnsToLeaf: depthToLeaf.get(head.id) ?? length,
      lastActive: lastActive.get(head.id) ?? head.time,
    });
    for (const kid of sortSiblings(kids).reverse()) {
      pending.push({ node: kid, depth: depth + 1, isBranch: true });
    }
  }
  return { rows, branchCount: Math.max(branchCount, nodes.length > 0 ? 1 : 0), forkPoints };
}
