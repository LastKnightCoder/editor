import { useEffect, useState } from "react";
import { compileCustomBlockTailwind } from "@/services/tailwindRuntime";

export function useTailwindRuntimeCss(
  content: string | undefined,
  extension = "tsx",
) {
  const [css, setCss] = useState("");

  useEffect(() => {
    let cancelled = false;
    const trimmed = content?.trim();
    if (!trimmed) {
      setCss("");
      return;
    }

    compileCustomBlockTailwind(trimmed, extension)
      .then((result) => {
        if (!cancelled) {
          setCss(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCss("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [content, extension]);

  return css;
}
