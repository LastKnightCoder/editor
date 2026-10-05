import { createContext, useContext, useEffect, useState } from "react";
import { isCollaborationResource } from "@tau/collaboration";
import type { EditorCollaborationBinding } from "./types";

export const CollaborationContext = createContext<EditorCollaborationBinding | undefined>(
  undefined
);
export const useCollaboration = () => useContext(CollaborationContext);
export function useCollaborationResource(url: string | undefined) {
  const binding = useCollaboration();
  const [resolved, setResolved] = useState<string>();
  useEffect(() => {
    let active = true;
    setResolved(undefined);
    if (isCollaborationResource(url) && binding) {
      void binding
        .resolveResource(url)
        .then(value => {
          if (active) setResolved(value);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [url, binding]);
  return isCollaborationResource(url) ? resolved : url;
}
