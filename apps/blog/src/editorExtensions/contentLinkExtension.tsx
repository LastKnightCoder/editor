import { memo, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import classNames from "classnames";
import { Tooltip, toast } from "@tau/ui";
import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor";
import { RenderElementProps } from "slate-react";
import { Editor } from "@tau/editor";
import { joinPath, getInitData } from "@blog/utils";
import type { ContentLinkTarget } from "@blog/types";
import {
  createContentLinkPreviewLoader,
  resolveContentLinkTarget,
  type ContentLinkPreviewData,
} from "./contentLinkPreview";

type ContentLinkElement = {
  type: "content-link";
  refId?: number;
  contentId?: number;
  contentType?: string;
  contentTitle?: string;
  children: unknown[];
};

type ContentLinkProps = {
  attributes: RenderElementProps["attributes"];
  element: ContentLinkElement;
  children: ReactNode;
  enablePreview: boolean;
};

type LinkPreviewState = {
  loading: boolean;
  data: ContentLinkPreviewData | null;
  error: string;
};

const linkPreviewLoader = createContentLinkPreviewLoader();
const unresolvedMessage = "目标未发布或不可用";
const DEFAULT_CONTENT_LINK_LABEL = "关联内容";
const COMPACT_CONTENT_LINK_LABEL = "内容";
function readText(input: unknown, fallback = ""): string {
  if (typeof input === "string" && input.trim()) {
    return input.trim();
  }
  return fallback;
}

function readNodeText(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }

  if (!input || typeof input !== "object") {
    return "";
  }

  const node = input as Record<string, unknown>;

  if (typeof node.text === "string") {
    return node.text;
  }

  if (Array.isArray(node.children)) {
    return node.children.map(readNodeText).join("");
  }

  return "";
}

const ContentLinkPreviewPanel = memo(({ state }: { state: LinkPreviewState }) => {
  if (state.loading) {
    return (
      <div className="blog-content-link-preview">
        <p className="blog-content-link-preview-tip">正在加载预览...</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="blog-content-link-preview">
        <p className="blog-content-link-preview-error">预览加载失败</p>
      </div>
    );
  }

  if (!state.data) {
    return (
      <div className="blog-content-link-preview">
        <p className="blog-content-link-preview-tip">暂无可预览内容</p>
      </div>
    );
  }

  return (
    <div className="blog-content-link-preview">
      <div className="blog-content-link-preview-body">
        <Editor
          initValue={state.data.content}
          readonly
          extensions={blogContentLinkPreviewExtensions}
        />
      </div>
    </div>
  );
});

ContentLinkPreviewPanel.displayName = "ContentLinkPreviewPanel";

const ContentLinkNode = memo((props: ContentLinkProps) => {
  const { attributes, element, children, enablePreview } = props;
  const { contentLinkTargets, site } = getInitData();
  const targetMap = contentLinkTargets as Record<string, ContentLinkTarget> | undefined;
  const target = useMemo(
    () =>
      resolveContentLinkTarget(
        { contentType: element.contentType, refId: element.refId },
        targetMap
      ),
    [element.contentType, element.refId, targetMap]
  );

  const inlineLabel = readText(readNodeText(element.children));
  const displayTitle = readText(element.contentTitle, COMPACT_CONTENT_LINK_LABEL);
  const shouldCompactLabel =
    !readText(element.contentTitle) && inlineLabel === DEFAULT_CONTENT_LINK_LABEL;
  const targetHref = target ? joinPath(site.basePath, target.href, { raw: true }) : "";
  const canPreview = enablePreview && !!target && !!targetHref;
  const [open, setOpen] = useState(false);
  const requestIdRef = useRef(0);
  const [previewState, setPreviewState] = useState<LinkPreviewState>({
    loading: false,
    data: null,
    error: "",
  });

  useEffect(() => {
    if (!open || !canPreview) {
      return;
    }

    let cancelled = false;
    const currentRequestId = ++requestIdRef.current;
    setPreviewState(previous => ({
      ...previous,
      loading: true,
      error: "",
    }));

    linkPreviewLoader
      .load(targetHref, displayTitle)
      .then(data => {
        if (cancelled || requestIdRef.current !== currentRequestId) {
          return;
        }
        setPreviewState({
          loading: false,
          data,
          error: "",
        });
      })
      .catch(() => {
        if (cancelled || requestIdRef.current !== currentRequestId) {
          return;
        }
        setPreviewState({
          loading: false,
          data: null,
          error: "PREVIEW_LOAD_FAILED",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [open, canPreview, displayTitle, targetHref]);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!target || !targetHref) {
      toast.info(unresolvedMessage);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      window.open(targetHref, "_blank", "noopener,noreferrer");
      return;
    }

    window.location.href = targetHref;
  };

  const linkNode = (
    <a
      {...attributes}
      href={targetHref || "#"}
      onClick={handleClick}
      className={classNames("blog-content-link", {
        "blog-content-link--unresolved": !target || !targetHref,
      })}
      title={displayTitle}
    >
      {shouldCompactLabel ? COMPACT_CONTENT_LINK_LABEL : children}
    </a>
  );

  if (!enablePreview || !target || !targetHref) {
    return linkNode;
  }

  return (
    <Tooltip
      open={open}
      onOpenChange={setOpen}
      placement="bottom"
      arrow={false}
      delay={350}
      className="bg-page text-ink-1 border-line-1 shadow-card max-w-[480px] overflow-hidden rounded-lg border p-0"
      content={<ContentLinkPreviewPanel state={previewState} />}
    >
      {linkNode}
    </Tooltip>
  );
});

ContentLinkNode.displayName = "ContentLinkNode";

const createBlogContentLinkExtension = (enablePreview: boolean) =>
  defineExtension({
    id: "host.content-link",
    elements: [
      defineElement({
        type: "content-link",
        kind: "inline",
        render: ({ attributes, children, element }: ElementRenderProps) => (
          <ContentLinkNode
            attributes={attributes}
            element={element as unknown as ContentLinkElement}
            enablePreview={enablePreview}
          >
            {children}
          </ContentLinkNode>
        ),
      }),
    ],
  });

export const blogContentLinkExtension = createBlogContentLinkExtension(true);
export const blogContentLinkPreviewExtensions = [createBlogContentLinkExtension(false)];
