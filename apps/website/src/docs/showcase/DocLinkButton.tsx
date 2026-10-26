/** 示意里的文档链接：站内切换不整页刷新，与正文链接一致 */
import type { ReactNode } from "react";
import { cn } from "@tau/ui";
import { docHref } from "../manifest.ts";
import { navigate } from "../router.ts";

export function DocLinkButton({
  slug,
  className,
  children,
}: {
  slug: string;
  className?: string;
  children: ReactNode;
}) {
  const href = docHref(slug);
  return (
    <a
      href={href}
      onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(href);
      }}
      className={cn("text-accent-text hover:underline", className)}
    >
      {children}
    </a>
  );
}
