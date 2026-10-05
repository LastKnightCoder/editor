/**
 * 对话正文排版（D-048）：段距 0.5em，列表用原生 marker（ink-3），引用 = 2px 引线 + 淡墨，
 * 表格 = line-1 描边圆角内框。颜色全部走 --tau-*，深浅主题无需 isDark 分支。
 * 桌面与浏览器扩展的对话 markdown 共用；代码、链接、文档引用由各端按自身能力覆盖。
 */

import { cn } from "@tau/ui";

/** 行内代码：surface 亮底 + line-1 描边 chip（D-009） */
export const INLINE_CODE_CLASS =
  "border-line-1 bg-page font-tau-mono text-ink-1 mx-px rounded-[5px] border px-[5px] py-px text-[0.88em]";

export const MARKDOWN_LINK_CLASS =
  "text-accent-text decoration-accent/35 hover:decoration-accent underline underline-offset-[3px]";

/** 文档引用：accent 轻染行内 chip */
export const DOCUMENT_REFERENCE_CLASS =
  "document-reference bg-accent-soft text-accent-text hover:bg-accent/20 ease-tau-out mx-px inline-flex cursor-pointer items-center gap-[3px] rounded-[6px] px-1.5 align-baseline text-[0.92em] font-medium leading-[1.55] transition-colors duration-[160ms]";

/* eslint-disable @typescript-eslint/no-explicit-any -- react-markdown 组件 props 含 node 等非 DOM 字段 */
export const markdownTypographyComponents = {
  p: ({ node: _node, className, ...props }: any) => (
    <p {...props} className={cn("my-2 first:mt-0 last:mb-0", className)} />
  ),
  h1: ({ node: _node, className, ...props }: any) => (
    <h1
      {...props}
      className={cn("text-tau-title-lg mb-2 mt-5 font-semibold first:mt-0", className)}
    />
  ),
  h2: ({ node: _node, className, ...props }: any) => (
    <h2 {...props} className={cn("mb-2 mt-5 text-[16px] font-semibold first:mt-0", className)} />
  ),
  h3: ({ node: _node, className, ...props }: any) => (
    <h3
      {...props}
      className={cn("text-tau-title mb-1.5 mt-4 font-semibold first:mt-0", className)}
    />
  ),
  h4: ({ node: _node, className, ...props }: any) => (
    <h4
      {...props}
      className={cn("text-tau-body-lg mb-1.5 mt-3 font-semibold first:mt-0", className)}
    />
  ),
  strong: ({ node: _node, className, ...props }: any) => (
    <strong {...props} className={cn("text-ink-1 font-semibold", className)} />
  ),
  hr: ({ node: _node, ...props }: any) => (
    <hr {...props} className="bg-line-1 my-4 h-px border-0" />
  ),
  ul: ({ node: _node, className, children, ...props }: any) => (
    <ul
      {...props}
      className={cn(
        "marker:text-ink-3 my-2 list-disc pl-5 first:mt-0 last:mb-0 [&_ol]:my-1 [&_ul]:my-1",
        className
      )}
    >
      {children}
    </ul>
  ),
  ol: ({ node: _node, className, children, ...props }: any) => (
    <ol
      {...props}
      className={cn(
        "marker:text-ink-3 my-2 list-decimal pl-5 first:mt-0 last:mb-0 [&_ol]:my-1 [&_ul]:my-1",
        className
      )}
    >
      {children}
    </ol>
  ),
  li: ({ node: _node, className, children, ...props }: any) => (
    <li {...props} className={cn("my-1 pl-0.5 [&>p]:my-0.5 [&_input]:mr-1.5", className)}>
      {children}
    </li>
  ),
  blockquote: ({ node: _node, children, className, ...props }: any) => (
    <blockquote
      {...props}
      className={cn("border-line-1 text-ink-2 my-3 border-l-2 pl-3.5 [&_p]:my-1", className)}
    >
      {children}
    </blockquote>
  ),
  table: ({ node: _node, className, children, ...props }: any) => (
    <div className="border-line-1 rounded-tau-sm my-3 max-w-full overflow-x-auto border">
      <table {...props} className={cn("text-tau-meta w-full border-collapse", className)}>
        {children}
      </table>
    </div>
  ),
  th: ({ node: _node, className, ...props }: any) => (
    <th
      {...props}
      className={cn(
        "bg-hover text-ink-1 whitespace-nowrap px-3 py-1.5 text-left font-semibold",
        className
      )}
    />
  ),
  td: ({ node: _node, className, ...props }: any) => (
    <td {...props} className={cn("border-line-2 border-t px-3 py-1.5 align-top", className)} />
  ),
};
/* eslint-enable @typescript-eslint/no-explicit-any */
