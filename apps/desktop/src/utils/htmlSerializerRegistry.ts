import { Descendant } from "slate";
import type { CustomElement, FormattedText } from "@tau/editor/src";
import { TEXT_GRADIENT_PRESETS } from "@tau/editor/src/constants";

export interface HtmlSerializer {
  type: string;
  isBlock?: boolean;
  toHtml: (
    element: any,
    childrenHtml: string,
    parentElement?: any,
    options?: HtmlSerializerOptions,
  ) => string | Promise<string>;
}

export interface HtmlSerializerOptions {
  theme?: "light" | "dark";
  codeTheme?: string;
  imageBaseUrl?: string;
  tailwindCssCollector?: string[];
}

export class HtmlSerializerRegistry {
  private serializers: Map<string, HtmlSerializer> = new Map();
  private blockTypes: Set<string> = new Set();

  register(serializer: HtmlSerializer): void {
    this.serializers.set(serializer.type, serializer);
    if (serializer.isBlock) {
      this.blockTypes.add(serializer.type);
    }
  }

  registerMany(serializers: HtmlSerializer[]): void {
    serializers.forEach((s) => this.register(s));
  }

  getSerializer(type: string): HtmlSerializer | undefined {
    return this.serializers.get(type);
  }

  isBlock(element: CustomElement): boolean {
    return this.blockTypes.has(element.type);
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Serialize a FormattedText leaf node to HTML
   */
  serializeLeaf(leaf: FormattedText, _options?: HtmlSerializerOptions): string {
    let html = this.escapeHtml(leaf.text);

    // Handle empty text
    if (!html) {
      return "";
    }

    // Apply formatting in order
    if (leaf.code) {
      html = `<code class="inline-code">${html}</code>`;
    }
    if (leaf.bold) {
      html = `<strong>${html}</strong>`;
    }
    if (leaf.italic) {
      html = `<em>${html}</em>`;
    }
    if (leaf.strikethrough) {
      html = `<del>${html}</del>`;
    }
    if (leaf.underline) {
      html = `<u>${html}</u>`;
    }
    if (leaf.highlight) {
      const color =
        typeof leaf.highlight === "string" ? leaf.highlight : "yellow";
      html = `<mark class="highlight-${color}">${html}</mark>`;
    }
    if (leaf.textGradient && leaf.textGradient in TEXT_GRADIENT_PRESETS) {
      const preset = TEXT_GRADIENT_PRESETS[leaf.textGradient];
      const isDark = _options?.theme === "dark";
      const gradient = isDark ? preset.dark : preset.light;
      const fallbackColor = isDark ? preset.fallbackDark : preset.fallbackLight;
      const gradientStyle = [
        `background-image: ${gradient}`,
        "background-clip: text",
        "-webkit-background-clip: text",
        `color: ${fallbackColor}`,
        "-webkit-text-fill-color: transparent",
      ].join("; ");
      html = `<span style="${gradientStyle}">${html}</span>`;
    } else if (leaf.color) {
      html = `<span style="color: ${leaf.color}">${html}</span>`;
    }

    return html;
  }

  /**
   * Serialize an element node to HTML (async version)
   */
  async serializeElementAsync(
    element: CustomElement,
    parentElement: CustomElement | null,
    options?: HtmlSerializerOptions,
  ): Promise<string> {
    const { type, children } = element;

    // Serialize children first (async)
    const childrenHtmlArray = children
      ? await Promise.all(
          children.map(async (node: Descendant) => {
            if ("type" in node && node.type === "formatted") {
              return this.serializeLeaf(node as FormattedText, options);
            }
            return this.serializeElementAsync(
              node as CustomElement,
              element,
              options,
            );
          }),
        )
      : [];
    const childrenHtml = childrenHtmlArray.join("");

    // Get the serializer for this element type
    const serializer = this.getSerializer(type);
    if (serializer) {
      const result = serializer.toHtml(
        element,
        childrenHtml,
        parentElement,
        options,
      );
      // Handle both sync and async serializers
      return await Promise.resolve(result);
    }

    // Fallback: return children HTML or the element type
    if (childrenHtml) {
      return childrenHtml;
    }
    return `<!-- Unknown element type: ${type} -->`;
  }

  /**
   * Serialize Slate content to HTML (async version)
   */
  async serializeAsync(
    value: Descendant[],
    options?: HtmlSerializerOptions,
  ): Promise<string> {
    const results = await Promise.all(
      value.map((element) =>
        this.serializeElementAsync(element as CustomElement, null, options),
      ),
    );
    return results.join("\n");
  }
}

export const htmlSerializerRegistry = new HtmlSerializerRegistry();
