import { useEffect, useMemo, useRef, useState } from "react";
import type { MenuRootContextValue } from "./Menu";

let activeMenuClose: (() => void) | null = null;

export interface UseMenuTreeOptions {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  focusReturn: () => void;
  isTarget: (target: Node) => boolean;
}

export function useMenuTree({
  open: openProp,
  onOpenChange,
  focusReturn,
  isTarget,
}: UseMenuTreeOptions) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const onOpenChangeRef = useRef(onOpenChange);
  const focusReturnRef = useRef(focusReturn);
  const isTargetRef = useRef(isTarget);
  const containersRef = useRef(new Set<HTMLDivElement>());
  const closeRef = useRef<() => void>(() => undefined);

  onOpenChangeRef.current = onOpenChange;
  focusReturnRef.current = focusReturn;
  isTargetRef.current = isTarget;

  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChangeRef.current?.(next);
  };
  const closeMenu = () => {
    setOpen(false);
    focusReturnRef.current();
  };
  closeRef.current = closeMenu;

  useEffect(() => {
    if (!open) return;
    const mine = () => {
      setInternalOpen(false);
      onOpenChangeRef.current?.(false);
    };
    if (activeMenuClose && activeMenuClose !== mine) activeMenuClose();
    activeMenuClose = mine;
    return () => {
      if (activeMenuClose === mine) activeMenuClose = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (isTargetRef.current(target)) return;
      if ([...containersRef.current].some(container => container.contains(target))) return;
      setInternalOpen(false);
      onOpenChangeRef.current?.(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const rootValue = useMemo<MenuRootContextValue>(
    () => ({
      closeMenu: () => closeRef.current(),
      registerContainer: el => containersRef.current.add(el),
      unregisterContainer: el => containersRef.current.delete(el),
    }),
    []
  );

  return { open, setOpen, closeMenu, rootValue };
}
