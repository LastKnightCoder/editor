import { desktopRuntimeStyleCompiler } from "@/services/tailwindRuntime";

/**
 * Compile Tailwind CSS for HTML content
 * Uses the same logic as useTailwindRuntimeCss hook
 */
export async function compileTailwindForHtml(
  content: string,
  extension: "html" | "tsx" = "html"
): Promise<string> {
  const trimmed = content?.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const css = await desktopRuntimeStyleCompiler.compile({ source: trimmed, language: extension });
    return css;
  } catch (error) {
    console.error("Failed to compile Tailwind CSS:", error);
    return "";
  }
}
