import { useEffect, useState } from "react";

export function useTailwindRuntimeCss(
  content: string | undefined,
  extension = "tsx",
  compilerService?: { tailwindRuntime: (html: string) => Promise<string> },
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
      compilerService.tailwindRuntime(trimmed)
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
    } else {
      setCss("");
    }

    return () => {
      cancelled = true;
    };
  }, [content, extension]);

  return css;
}
