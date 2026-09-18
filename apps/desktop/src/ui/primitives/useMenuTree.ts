import { useMemo, useRef, useState } from "react";
import type { MenuRootContextValue } from "./Menu";

export interface UseMenuTreeOptions {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  focusReturn: () => void;
}

/**
 * 菜单树开合状态机：受控 open + 整树关闭（还焦触发器）。
 * 外点与跨实例互斥自 D-013 起收口 useLayerDismiss（MenuSurface 逐层登记），
 * 本 hook 不再挂自己的 document 监听——同一 pointerdown 双关会让受控
 * onOpenChange 收到两次回调。
 */
export function useMenuTree({ open: openProp, onOpenChange, focusReturn }: UseMenuTreeOptions) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const onOpenChangeRef = useRef(onOpenChange);
  const focusReturnRef = useRef(focusReturn);
  const closeRef = useRef<() => void>(() => undefined);

  onOpenChangeRef.current = onOpenChange;
  focusReturnRef.current = focusReturn;

  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChangeRef.current?.(next);
  };
  const closeMenu = () => {
    setOpen(false);
    focusReturnRef.current();
  };
  closeRef.current = closeMenu;

  const rootValue = useMemo<MenuRootContextValue>(
    () => ({
      closeMenu: () => closeRef.current(),
    }),
    []
  );

  return { open, setOpen, closeMenu, rootValue };
}
