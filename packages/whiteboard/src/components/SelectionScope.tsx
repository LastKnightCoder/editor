import { useLayoutEffect, useState, type ReactNode } from "react";
import { SelectionContext, SelectionStore } from "../context";
import type { Selection } from "../types";

export function SelectionScope({
  value,
  children,
}: {
  value: Selection | null;
  children: ReactNode;
}) {
  const [store] = useState(() => new SelectionStore(value));
  useLayoutEffect(() => {
    store.publish(value);
  }, [store, value]);
  return <SelectionContext.Provider value={store}>{children}</SelectionContext.Provider>;
}
