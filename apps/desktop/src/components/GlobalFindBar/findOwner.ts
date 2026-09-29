/**
 * 查找接管：自带查找的区域（PDF 阅读器、设置弹窗的分区搜索…）在生效期间注册打开函数，
 * 全局查找条收到 Ctrl/⌘+F 时交给最后注册的接管者（LIFO：后打开的浮层优先于底下的页面），
 * 没有接管者才打开页内文本查找。保活隐藏的页面 effect 已清理，注册随之撤销。
 */

import { useEffect, useRef } from "react";

const owners: Array<{ open: () => void }> = [];

export function useFindOwner(open: () => void, active = true) {
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!active) return;
    const entry = { open: () => openRef.current() };
    owners.push(entry);
    return () => {
      const index = owners.indexOf(entry);
      if (index >= 0) owners.splice(index, 1);
    };
  }, [active]);
}

/** 交给接管者打开查找；没有接管者返回 false */
export function openOwnedFind(): boolean {
  const owner = owners[owners.length - 1];
  if (!owner) return false;
  owner.open();
  return true;
}
