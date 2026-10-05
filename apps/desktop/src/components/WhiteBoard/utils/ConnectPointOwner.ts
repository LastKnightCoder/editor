import type { Point } from "../types";

export interface ConnectPointBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ConnectPointCandidate {
  bounds: ConnectPointBounds;
  /** 容器元素（如 Frame）：内部空白让给子元素，只有靠近边框时才参与竞争 */
  container: boolean;
}

const getDistanceToBounds = (pointer: Point, bounds: ConnectPointBounds) => {
  const dx = Math.max(bounds.x - pointer.x, 0, pointer.x - (bounds.x + bounds.width));
  const dy = Math.max(bounds.y - pointer.y, 0, pointer.y - (bounds.y + bounds.height));
  return Math.hypot(dx, dy);
};

const getDistanceToEdgeFromInside = (pointer: Point, bounds: ConnectPointBounds) =>
  Math.min(
    pointer.x - bounds.x,
    bounds.x + bounds.width - pointer.x,
    pointer.y - bounds.y,
    bounds.y + bounds.height - pointer.y
  );

/**
 * 在指针附近的候选元素中选出唯一显示连接点的元素：
 * 指针在元素内部优先于只在外扩感应区内；同为内部取面积最小（嵌套时落到最内层），
 * 同为外部取距离最近，再以面积小者优先。
 */
export const resolveConnectPointOwner = (
  candidates: Iterable<[string, ConnectPointCandidate]>,
  pointer: Point | null,
  radius: number
): string | null => {
  if (!pointer) return null;

  let ownerId: string | null = null;
  let ownerInside = false;
  let ownerDistance = Infinity;
  let ownerArea = Infinity;

  for (const [id, { bounds, container }] of candidates) {
    const distance = getDistanceToBounds(pointer, bounds);
    if (distance > radius) continue;

    const inside = distance === 0;
    if (container && inside && getDistanceToEdgeFromInside(pointer, bounds) > radius) {
      continue;
    }

    const area = Math.abs(bounds.width * bounds.height);
    const isBetter =
      ownerId === null ||
      (inside && !ownerInside) ||
      (inside === ownerInside &&
        (inside
          ? area < ownerArea
          : distance < ownerDistance || (distance === ownerDistance && area < ownerArea)));

    if (isBetter) {
      ownerId = id;
      ownerInside = inside;
      ownerDistance = distance;
      ownerArea = area;
    }
  }

  return ownerId;
};

export interface ConnectPointOwnerStore {
  getOwner: () => string | null;
  subscribe: (listener: () => void) => () => void;
  setPointer: (point: Point | null) => void;
  /** 注册或更新候选元素，返回注销函数 */
  register: (id: string, candidate: ConnectPointCandidate) => () => void;
  /** 拖动箭头端点时的落点归属：与悬停同一套规则，按给定半径即时求值（同一点结果缓存，供各元素共享） */
  resolveAt: (point: Point, radius: number) => string | null;
  /** 指针停在某元素的连接点上或正从它拖出箭头时锁定归属，避免被邻近元素抢走 */
  lock: (id: string) => void;
  unlock: (id: string) => void;
  dispose: () => void;
}

export const createConnectPointOwnerStore = ({
  radius,
  hideDelay,
}: {
  radius: number;
  /** 归属变为空时延迟清空，吸收感应区边缘的抖动 */
  hideDelay: number;
}): ConnectPointOwnerStore => {
  const candidates = new Map<string, ConnectPointCandidate>();
  const listeners = new Set<() => void>();
  let pointer: Point | null = null;
  let owner: string | null = null;
  let lockedId: string | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let recomputeScheduled = false;
  let candidatesVersion = 0;
  let resolveCache: {
    version: number;
    x: number;
    y: number;
    radius: number;
    owner: string | null;
  } | null = null;

  const clearHideTimer = () => {
    if (hideTimer === null) return;
    clearTimeout(hideTimer);
    hideTimer = null;
  };

  const setOwner = (next: string | null) => {
    if (owner === next) return;
    owner = next;
    listeners.forEach(listener => listener());
  };

  const recompute = () => {
    const next =
      lockedId !== null && candidates.has(lockedId)
        ? lockedId
        : resolveConnectPointOwner(candidates, pointer, radius);

    if (next === null && owner !== null) {
      if (hideTimer === null) {
        hideTimer = setTimeout(() => {
          hideTimer = null;
          setOwner(null);
        }, hideDelay);
      }
      return;
    }
    clearHideTimer();
    setOwner(next);
  };

  // 元素批量挂载或拖动时会密集注册，合并到一次计算
  const scheduleRecompute = () => {
    if (recomputeScheduled) return;
    recomputeScheduled = true;
    queueMicrotask(() => {
      recomputeScheduled = false;
      recompute();
    });
  };

  return {
    getOwner: () => owner,
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setPointer: point => {
      pointer = point;
      recompute();
    },
    register: (id, candidate) => {
      candidates.set(id, candidate);
      candidatesVersion += 1;
      scheduleRecompute();
      return () => {
        if (candidates.get(id) !== candidate) return;
        candidates.delete(id);
        candidatesVersion += 1;
        scheduleRecompute();
      };
    },
    resolveAt: (point, radius) => {
      if (
        resolveCache &&
        resolveCache.version === candidatesVersion &&
        resolveCache.x === point.x &&
        resolveCache.y === point.y &&
        resolveCache.radius === radius
      ) {
        return resolveCache.owner;
      }
      const resolved = resolveConnectPointOwner(candidates, point, radius);
      resolveCache = {
        version: candidatesVersion,
        x: point.x,
        y: point.y,
        radius,
        owner: resolved,
      };
      return resolved;
    },
    lock: id => {
      lockedId = id;
      recompute();
    },
    unlock: id => {
      if (lockedId !== id) return;
      lockedId = null;
      recompute();
    },
    dispose: clearHideTimer,
  };
};
