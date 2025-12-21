import { compileCustomBlockTailwind } from "@/services/tailwindRuntime";

/**
 * Compile Tailwind CSS for HTML content
 * Uses the same logic as useTailwindRuntimeCss hook
 */
export async function compileTailwindForHtml(
  content: string,
  extension = "html",
): Promise<string> {
  const trimmed = content?.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const css = await compileCustomBlockTailwind(trimmed, extension);
    return css;
  } catch (error) {
    console.error("Failed to compile Tailwind CSS:", error);
    return "";
  }
}
