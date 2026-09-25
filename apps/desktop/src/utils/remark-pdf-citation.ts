import { visit } from "unist-util-visit";
import { parsePdfCitationLabel } from "@/utils/pdfCitation";

const PDF_CITATION_PATTERN = /:pdfref\[([^\]]+)\]\{([^}]+)\}/g;

const parsePdfCitationAttributes = (rawAttributes: string) => {
  const attributes: Record<string, string> = {};

  rawAttributes
    .trim()
    .split(/\s+/)
    .forEach(item => {
      const [key, ...rest] = item.split("=");
      if (!key || rest.length === 0) {
        return;
      }
      attributes[key] = rest.join("=");
    });

  return attributes;
};

const toOptionalNumber = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const remarkPdfCitation = () => {
  return (tree: any) => {
    visit(tree, "text", (node: any, index: number | undefined, parent: any) => {
      if (!parent || typeof index !== "number") {
        return;
      }

      const text = String(node.value || "");
      const matches = [...text.matchAll(PDF_CITATION_PATTERN)];
      if (matches.length === 0) {
        return;
      }

      const newNodes: any[] = [];
      let lastIndex = 0;

      matches.forEach(match => {
        const [fullMatch, labelText, rawAttributes] = match;
        const matchStart = match.index || 0;
        const matchEnd = matchStart + fullMatch.length;

        if (matchStart > lastIndex) {
          newNodes.push({
            type: "text",
            value: text.slice(lastIndex, matchStart),
          });
        }

        const baseCitation = parsePdfCitationLabel(labelText);
        const attributes = parsePdfCitationAttributes(rawAttributes);
        const pageNumber = toOptionalNumber(attributes.page);

        if (!baseCitation || !pageNumber || pageNumber <= 0) {
          newNodes.push({
            type: "text",
            value: fullMatch,
          });
          lastIndex = matchEnd;
          return;
        }

        newNodes.push({
          type: "pdfCitationReference",
          data: {
            hName: "span",
            hProperties: {
              className: "pdf-citation",
              "data-page": String(pageNumber),
              "data-char-start": attributes.charStart,
              "data-char-end": attributes.charEnd,
              "data-preview-text": baseCitation.previewText || "",
              "data-label": baseCitation.label || labelText,
            },
          },
          children: [
            {
              type: "text",
              value: baseCitation.label || labelText,
            },
          ],
        });

        lastIndex = matchEnd;
      });

      if (lastIndex < text.length) {
        newNodes.push({
          type: "text",
          value: text.slice(lastIndex),
        });
      }

      parent.children.splice(index, 1, ...newNodes);
    });
  };
};

export default remarkPdfCitation;
