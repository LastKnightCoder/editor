import abcjs from "abcjs";

/**
 * Render ABC notation to HTML using abcjs
 * Returns the rendered HTML string
 */
export function renderAbc(abcContent: string): string {
  try {
    // Create a temporary container in body (invisible or outside viewport)
    const container = document.createElement("div");
    const tempId = `abc-temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    container.id = tempId;
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.style.visibility = "hidden";

    // Append to body
    document.body.appendChild(container);

    // Render ABC notation to the container
    abcjs.renderAbc(tempId, abcContent, {
      responsive: "resize",
      foregroundColor: "#000000",
    });

    // Get the rendered HTML
    const renderedHtml = container.innerHTML;

    // Clean up - remove the div dom
    document.body.removeChild(container);

    return renderedHtml;
  } catch (error) {
    console.error("Failed to render ABC notation:", error);
    // Return fallback on error
    return `<pre class="abc-notation"><code>${escapeHtml(abcContent)}</code></pre>`;
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
