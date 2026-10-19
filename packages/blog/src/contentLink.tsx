import { createContext, useContext, type ReactNode } from "react";
import type { ContentRef } from "@tau/plugins/publish-data";
import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor";

export interface LinkRenderProps {
  /** 目标键 `${contentType}:${refId}`，与 QuestMaterial.citeKey 同一口径。 */
  identity: string;
  /** 已发布的目标；未发布时为空。 */
  target?: ContentRef;
  /** hrefFor(target) 的结果；没有 hrefFor 或目标未发布时为空。 */
  href?: string;
  /** 作者为链接保存的目标标题，可能为空。 */
  title: string;
  /** 链接显示的文字。 */
  text: string;
  /** 已渲染的链接文字，必须放进返回的元素里。 */
  children: ReactNode;
}

export interface LinkOptions {
  links?: Record<string, ContentRef>;
  hrefFor?: (target: ContentRef) => string | undefined;
  renderLink?: (props: LinkRenderProps) => ReactNode;
}

export const LinkContext = createContext<LinkOptions>({});

const textOf = (node: unknown): string => {
  if (!node || typeof node !== "object") return "";
  const value = node as { text?: unknown; children?: unknown };
  if (typeof value.text === "string") return value.text;
  return Array.isArray(value.children) ? value.children.map(textOf).join("") : "";
};

function ContentLink({ attributes, children, element }: ElementRenderProps) {
  const { links, hrefFor, renderLink } = useContext(LinkContext);
  const node = element as unknown as {
    contentType?: unknown;
    refId?: unknown;
    contentTitle?: unknown;
  };
  const identity = `${String(node.contentType)}:${String(node.refId)}`;
  const target = links?.[identity];
  const href = target ? hrefFor?.(target) : undefined;
  const props: LinkRenderProps = {
    identity,
    target,
    href,
    title: typeof node.contentTitle === "string" ? node.contentTitle : "",
    text: textOf(element),
    children,
  };
  return (
    <span {...attributes}>
      {renderLink ? renderLink(props) : href ? <a href={href}>{children}</a> : children}
    </span>
  );
}

export const contentLinkExtension = defineExtension({
  id: "tau.published-content-link",
  elements: [defineElement({ type: "content-link", kind: "inline", render: ContentLink })],
});
