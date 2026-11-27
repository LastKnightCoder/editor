import { createContext, useContext, useEffect, useState } from "react";
import { isCollaborationResource } from "@tau/collaboration";
import type { ContentCollaborationBinding } from "./types";

export const CollaborationContext = createContext<ContentCollaborationBinding | undefined>(
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
        .catch(error => {
          // 解析失败时图片等资源保持未解析，界面上只看得到空白
          console.warn("协作资源解析失败", { url }, error);
        });
    }
    return () => {
      active = false;
    };
  }, [url, binding]);
  return isCollaborationResource(url) ? resolved : url;
}
