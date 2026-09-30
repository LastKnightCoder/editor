import { useEffect, useState } from "react";
import type { RuntimeStyleCompiler, RuntimeStyleRequest } from "@tau/shared/runtime-style";

export function useTailwindRuntimeCss(
  content: string | undefined,
  extension: RuntimeStyleRequest["language"] = "tsx",
  compilerService?: RuntimeStyleCompiler
) {
  const [css, setCss] = useState("");

  useEffect(() => {
    let cancelled = false;
    const trimmed = content?.trim();
    if (!trimmed) {
      setCss("");
      return;
    }

    if (compilerService) {
      compilerService
        .compile({ source: trimmed, language: extension })
        .then(result => {
          if (!cancelled) {
            setCss(result);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCss("");
          }
        });
    } else {
      setCss("");
    }

    return () => {
      cancelled = true;
    };
  }, [content, extension, compilerService]);

  return css;
}
