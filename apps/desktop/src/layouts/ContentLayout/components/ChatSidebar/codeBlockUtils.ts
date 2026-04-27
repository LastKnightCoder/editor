export const MARKDOWN_BLOCK_CODE_ATTRIBUTE = "data-markdown-block-code";
export const MARKDOWN_BLOCK_CODE_VALUE = "true";

interface CodeBlockRenderHint {
  className?: string;
  "data-markdown-block-code"?: string;
}

export const shouldRenderAsBlockCode = ({
  className,
  "data-markdown-block-code": markdownBlockCode,
}: CodeBlockRenderHint): boolean => {
  if (typeof className === "string" && /language-([\w-]+)/.test(className)) {
    return true;
  }

  return markdownBlockCode === MARKDOWN_BLOCK_CODE_VALUE;
};
