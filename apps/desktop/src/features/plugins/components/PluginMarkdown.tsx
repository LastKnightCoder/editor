import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly/parseOnly";
import { ImageOff } from "lucide-react";
import { MARKDOWN_LINK_CLASS, markdownTypographyComponents } from "@tau/chat-ui";
import { openExternal } from "@/commands/extra";

const remarkPlugins = [remarkGfm, remarkCjkFriendly];

// 与门户同一安全子集：不渲染原始 HTML，不加载远程图片，链接交给系统浏览器。
const components: Components = {
  ...markdownTypographyComponents,
  a: ({ href, children }) => (
    <a
      href={href}
      className={MARKDOWN_LINK_CLASS}
      onClick={event => {
        event.preventDefault();
        if (href && /^https?:/i.test(href)) void openExternal(href);
      }}
    >
      {children}
    </a>
  ),
  img: ({ alt }) => (
    <span className="border-line-1 text-tau-sm text-ink-3 my-2 flex items-center gap-2 rounded-[10px] border px-3 py-2">
      <ImageOff className="size-4" strokeWidth={1.75} />
      图片不在应用内加载{alt ? `：${alt}` : ""}
    </span>
  ),
};

export function PluginMarkdown({ source }: { source: string }) {
  return (
    <div className="text-tau-body text-ink-1 max-w-[72ch]">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
