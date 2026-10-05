export const markdownClasses = {
  // 排版由 markdownTypographyComponents 负责，这里只补公式与选择
  markdown:
    "select-text [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-0.5 [&_.katex-display>.katex]:mx-auto [&_.katex-display>.katex]:w-fit",
  previewCard:
    "my-3 block w-full cursor-pointer rounded-tau-sm border border-line-1 bg-accent-soft px-4 py-3 text-left transition-colors hover:bg-selected",
  previewTitle: "text-tau-body font-semibold text-ink-1",
  previewDesc: "mt-1 text-tau-meta text-ink-2",
  previewTag:
    "mt-2 inline-flex items-center rounded-full border border-line-1 px-2 py-0.5 text-tau-meta text-accent",
};
