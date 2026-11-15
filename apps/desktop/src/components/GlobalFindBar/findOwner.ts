/**
 * 查找接管：自带查找的区域（PDF 阅读器等）在生效期间注册打开函数，
 * 全局查找条收到 Ctrl/⌘+F 时交给最后注册的接管者（LIFO：后打开的浮层优先于底下的页面），
 * 没有接管者才打开页内文本查找。保活隐藏的页面 effect 已清理，注册随之撤销。
 */

import { useEffect, useRef } from "react";

export interface FindResults {
  count: number;
  reveal(index: number, scroll: boolean): void | (() => void);
}

export interface FindSource {
  search(query: string): FindResults;
  subscribe(listener: () => void): () => void;
}

type FindOwner = { open: () => void } | { source: FindSource };
const owners: FindOwner[] = [];
const listeners = new Set<() => void>();

function register(owner: FindOwner) {
  owners.push(owner);
  for (const listener of listeners) listener();
  return () => {
    const index = owners.indexOf(owner);
    if (index >= 0) owners.splice(index, 1);
    for (const listener of listeners) listener();
  };
}

export function useFindOwner(open: () => void, active = true) {
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!active) return;
    return register({ open: () => openRef.current() });
  }, [active]);
}

/** 交给接管者打开查找；没有接管者返回 false */
export function openOwnedFind(): boolean {
  const owner = owners[owners.length - 1];
  if (!owner || !("open" in owner)) return false;
  owner.open();
  return true;
}

/** 复用全局查找条，由当前页面提供命中和定位。 */
export function useFindSource(source: FindSource) {
  useEffect(() => register({ source }), [source]);
}

export function getFindSource(): FindSource | null {
  const owner = owners.at(-1);
  return owner && "source" in owner ? owner.source : null;
}

export function subscribeFindSource(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
