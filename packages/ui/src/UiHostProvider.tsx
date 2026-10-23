import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";

export type UiRegisterDismiss = (dismiss: () => void) => () => void;
const HostDismissContext = createContext<UiRegisterDismiss | undefined>(undefined);

/** 宿主负责返回仲裁，UI 不依赖任何页面框架。 */
export function UiHostProvider({
  registerDismiss,
  children,
}: {
  registerDismiss: UiRegisterDismiss;
  children: ReactNode;
}) {
  return (
    <HostDismissContext.Provider value={registerDismiss}>{children}</HostDismissContext.Provider>
  );
}

/** 子模态先消费返回，避免同批挂载时子 effect 先执行而颠倒退场顺序。 */
export function UiDismissBoundary({
  open,
  dismiss,
  children,
}: {
  open: boolean;
  dismiss: () => void;
  children: ReactNode;
}) {
  const parent = useContext(HostDismissContext);
  const latest = useRef(dismiss);
  latest.current = dismiss;
  const childrenStack = useRef(new Set<() => void>());
  const register = useMemo<UiRegisterDismiss>(
    () => child => {
      childrenStack.current.add(child);
      return () => {
        childrenStack.current.delete(child);
      };
    },
    []
  );
  useLayoutEffect(() => {
    if (!open) return;
    return parent?.(() => {
      const children = [...childrenStack.current];
      if (children.length) children[children.length - 1]();
      else latest.current();
    });
  }, [open, parent]);
  return <HostDismissContext.Provider value={register}>{children}</HostDismissContext.Provider>;
}
