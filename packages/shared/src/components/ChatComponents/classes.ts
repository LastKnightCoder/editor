const card =
  "my-3 overflow-hidden rounded-tau-sm border border-line-1 bg-accent-soft backdrop-blur-[8px] transition-colors hover:bg-selected";
const header =
  "flex cursor-pointer select-none items-center justify-between px-4 py-3 hover:bg-hover";
const button =
  "cursor-pointer border-0 bg-transparent p-1 text-tau-meta text-ink-2 transition-colors hover:text-ink-1";
const label = "mb-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-ink-3";

export const toolClasses = {
  dark: "",
  toolCallCard: card,
  toolCallHeader: header,
  headerLeft: "flex min-w-0 flex-1 items-center gap-2.5",
  toolName: "font-tau-mono text-tau-body font-semibold text-ink-1 [overflow-wrap:anywhere]",
  statusText: "ml-auto whitespace-nowrap text-tau-meta text-ink-2",
  iconPending: "flex-none text-ink-3",
  iconExecuting: "flex-none text-accent",
  iconRetrying: "flex-none text-warn",
  iconSuccess: "flex-none text-ok",
  iconFailed: "flex-none text-danger",
  expandButton: button,
  toolCallBody: "select-text px-4 pb-3 animate-[tau-shared-reveal_0.2s_ease]",
  section: "mb-3 last:mb-0",
  sectionLabel: label,
  codeBlock:
    "m-0 overflow-x-auto whitespace-pre-wrap break-words rounded-tau-sm border border-line-2 bg-surface px-3 py-2.5 font-tau-mono text-tau-meta leading-normal text-ink-1",
  errorBlock:
    "rounded-tau-sm border border-line-1 bg-danger-soft px-3 py-2.5 text-tau-body leading-normal text-danger",
};

export const messageClasses = {
  dark: "",
  messageContainer: "flex w-full flex-col",
  userContainer: "items-end",
  assistantContainer: "items-start",
  message: "relative box-border overflow-visible rounded-tau-md p-6",
  messageContent: "w-full select-text",
  assistantMessage: "w-[85%] border border-line-1 bg-hover",
  userMessage: "w-fit max-w-[85%] bg-hover",
  toolCallsContainer: "mb-4",
  block: "mb-4 last:mb-0",
  imagesContainer: "mb-4 flex flex-wrap gap-2",
  filesContainer: "mb-4 flex flex-col gap-2",
  fileAttachment:
    "flex w-full cursor-pointer items-center justify-between rounded-tau-sm border border-line-1 bg-hover px-3.5 py-3 text-left transition-colors hover:bg-press",
  fileInfo: "flex items-center gap-2 text-tau-body text-ink-1 [&_svg]:text-danger",
  fileAction: "text-tau-meta text-accent",
  messageImage:
    "max-h-[200px] max-w-[300px] cursor-pointer rounded-tau-sm object-cover transition-transform hover:scale-[1.02]",
  messageActions:
    "invisible mt-2 flex gap-1 px-1 opacity-0 transition-[opacity,visibility] duration-150",
  show: "visible opacity-100",
  userActions: "self-end justify-end",
  assistantActions: "self-start justify-start",
  actionButton:
    "relative flex size-7 cursor-pointer items-center justify-center rounded-tau-sm border border-line-1 bg-hover text-ink-3 backdrop-blur-[8px] transition-colors hover:bg-press hover:text-ink-1 [&_svg]:size-3.5",
  reasoningCard: card,
  reasoningHeader: header,
  reasoningHeaderContent: "flex items-center gap-2",
  reasoningIcon: "text-accent",
  reasoningTitle: "text-tau-body font-semibold uppercase tracking-[0.5px] text-ink-2",
  reasoningDuration: "ml-1 text-tau-meta font-medium text-accent",
  reasoningExpandButton: button,
  reasoningBody:
    "select-text px-4 pb-3 text-tau-body leading-[1.8] text-ink-2 animate-[tau-shared-reveal_0.2s_ease]",
  versionSwitcher:
    "mt-1.5 flex items-center gap-0.5 self-end px-1 text-tau-meta tabular-nums text-ink-3 [&_button]:flex [&_button]:size-[22px] [&_button]:cursor-pointer [&_button]:items-center [&_button]:justify-center [&_button]:rounded-tau-sm [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-tau-body [&_button:hover:not(:disabled)]:bg-hover [&_button:hover:not(:disabled)]:text-ink-1 [&_button:disabled]:cursor-default [&_button:disabled]:opacity-35",
};

export const markdownClasses = {
  dark: "",
  markdown:
    "rounded-tau-md font-[family-name:var(--font)] text-[length:var(--font-size)] select-text [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-0.5 [&_.katex-display>.katex]:mx-auto [&_.katex-display>.katex]:w-fit [&_p:last-child]:mb-0 [&_p:not(:first-child):not(:last-child)]:my-4 [&_code]:font-[family-name:var(--mono-font)] [&_code]:text-[0.8em] [&_code_.token]:not-italic [&_code:not([data-markdown-block-code=true]):not(pre_code)]:rounded-tau-sm [&_code:not([data-markdown-block-code=true]):not(pre_code)]:border [&_code:not([data-markdown-block-code=true]):not(pre_code)]:border-line-1 [&_code:not([data-markdown-block-code=true]):not(pre_code)]:bg-hover [&_code:not([data-markdown-block-code=true]):not(pre_code)]:px-[0.35em] [&_code:not([data-markdown-block-code=true]):not(pre_code)]:py-[0.1em] [&_pre]:my-[1.5em] [&_pre:first-child]:mt-0 [&_pre:last-child]:mb-0 [&_table]:mb-4 [&_table]:w-full [&_table]:border-collapse [&_tr:first-child]:font-bold [&_thead_tr]:bg-hover [&_tr:nth-child(even)]:bg-hover [&_th]:border [&_td]:border [&_th]:border-line-1 [&_td]:border-line-1 [&_th]:px-4 [&_td]:px-4 [&_th]:py-3 [&_td]:py-3 [&_th]:text-left [&_td]:text-left [&_th]:break-words [&_td]:break-words [&_h1]:my-[1em] [&_h2]:my-[1em] [&_h3]:my-[1em] [&_h4]:my-[1em] [&_h5]:my-[1em] [&_h6]:my-[1em] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold [&_h1]:text-[2em] [&_h2]:text-[1.5em] [&_h3]:text-[1.25em] [&_h4]:text-[1em] [&_ul]:my-[1.5em] [&_ol]:my-[1.5em] [&_ul]:ps-[2.5em] [&_ol]:ps-[2.5em] [&_li]:mb-[1.25em] [&_li:last-child]:mb-0 [&_blockquote]:relative [&_blockquote]:my-[1em] [&_blockquote]:py-[0.75em] [&_blockquote]:pl-[1.5em] [&_blockquote]:italic [&_blockquote]:leading-[1.7] [&_blockquote]:text-ink-2 [&_blockquote]:before:absolute [&_blockquote]:before:left-0 [&_blockquote]:before:inset-y-[0.25em] [&_blockquote]:before:w-1 [&_blockquote]:before:rounded-full [&_blockquote]:before:bg-accent [&_blockquote]:before:content-[''] [&_blockquote_p]:m-0 [&_blockquote_p+p]:mt-[0.5em] [&_hr]:mx-auto [&_hr]:my-[1.5em] [&_hr]:h-[0.125em] [&_hr]:w-[90%] [&_hr]:border-0 [&_hr]:bg-line-1 [&_img]:my-[0.5em] [&_img]:max-w-full [&_img]:rounded-tau-sm",
  previewCard:
    "my-3 block w-full cursor-pointer rounded-tau-sm border border-line-1 bg-accent-soft px-4 py-3 text-left transition-colors hover:bg-selected",
  previewTitle: "text-tau-body font-semibold text-ink-1",
  previewDesc: "mt-1 text-tau-meta text-ink-2",
  previewTag:
    "mt-2 inline-flex items-center rounded-full border border-line-1 px-2 py-0.5 text-tau-meta text-accent",
};
