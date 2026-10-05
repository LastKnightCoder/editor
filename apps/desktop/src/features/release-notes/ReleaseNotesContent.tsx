import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly/parseOnly";
import { MARKDOWN_LINK_CLASS, markdownTypographyComponents } from "@tau/chat-ui";
import type { ReleaseNote } from "@/commands/updater";
import { openExternal } from "@/commands";

const remarkPlugins = [remarkGfm, remarkCjkFriendly];

const components: Components = {
  ...markdownTypographyComponents,
  a: ({ href, children }) => (
    <a
      href={href}
      className={MARKDOWN_LINK_CLASS}
      onClick={event => {
        event.preventDefault();
        if (href) void openExternal(href);
      }}
    >
      {children}
    </a>
  ),
};

/** 公告正文：多个版本时逐版加版本号分隔，单版本由外层标题承担版本号 */
export function ReleaseNotesContent({ notes }: { notes: ReleaseNote[] }) {
  const showVersion = notes.length > 1;
  return (
    <div className="text-tau-body text-ink-1 flex flex-col gap-5">
      {notes.map(item => (
        <section key={item.version}>
          {showVersion && (
            <div className="font-tau-mono text-tau-meta text-ink-2 mb-2">v{item.version}</div>
          )}
          <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
            {item.note}
          </ReactMarkdown>
        </section>
      ))}
    </div>
  );
}
