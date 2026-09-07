import { useSyncExternalStore } from "react";

import { BLOG_THEME_CHANGE_EVENT, getTheme } from "@blog/utils";

export default function useBlogTheme(): "light" | "dark" {
  return useSyncExternalStore(
    listener => {
      window.addEventListener(BLOG_THEME_CHANGE_EVENT, listener);
      return () => window.removeEventListener(BLOG_THEME_CHANGE_EVENT, listener);
    },
    getTheme,
    () => "light"
  );
}
