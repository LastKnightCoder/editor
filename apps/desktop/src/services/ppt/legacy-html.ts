export const cleanPPTHtmlContent = (content: string): string => {
  let html = content.trim();

  html = html.replace(/^```\s*html?\s*\n?/i, "");
  html = html.replace(/^```\s*\n?/i, "");
  html = html.replace(/\n?\s*```\s*$/i, "");
  html = html.replace(/^`{3,}\s*html?\s*/gim, "");
  html = html.replace(/\s*`{3,}\s*$/gim, "");

  const doctypeIndex = html.toLowerCase().indexOf("<!doctype");
  const htmlTagIndex = html.toLowerCase().indexOf("<html");
  const startIndex = doctypeIndex !== -1 ? doctypeIndex : htmlTagIndex !== -1 ? htmlTagIndex : -1;

  if (startIndex > 0) {
    html = html.substring(startIndex);
  }

  const endIndex = html.toLowerCase().lastIndexOf("</html>");
  if (endIndex !== -1) {
    html = html.substring(0, endIndex + 7);
  }

  return html.trim();
};
