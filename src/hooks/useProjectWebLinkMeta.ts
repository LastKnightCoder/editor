import { useEffect, useState } from "react";
import {
  ProjectItem,
  EProjectItemType,
  WebLinkSourceType,
  WebLink,
} from "@/types";
import { getWebLinkById } from "@/commands";

interface ProjectWebLinkMeta {
  title: string;
  url: string;
  sourceType: WebLinkSourceType;
  linkId?: number;
}

const useProjectWebLinkMeta = (
  projectItem?: Partial<ProjectItem> | null,
): ProjectWebLinkMeta => {
  const linkId =
    projectItem?.refType === "web-link" && projectItem.refId
      ? projectItem.refId
      : undefined;

  const refreshToken =
    projectItem?.projectItemType === EProjectItemType.WebView
      ? projectItem?.updateTime
      : undefined;

  const [link, setLink] = useState<WebLink | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!linkId) {
      setLink(null);
      return () => {
        cancelled = true;
      };
    }

    const fetchLink = async () => {
      try {
        const data = await getWebLinkById(linkId);
        if (!cancelled) {
          setLink(data);
        }
      } catch (error) {
        console.error("获取 WebLink 信息失败:", error);
        if (!cancelled) {
          setLink(null);
        }
      }
    };

    fetchLink();

    return () => {
      cancelled = true;
    };
  }, [linkId, refreshToken]);

  if (projectItem?.projectItemType === EProjectItemType.WebView) {
    if (link) {
      return {
        title: link.title,
        url: link.url,
        sourceType: link.sourceType,
        linkId,
      };
    }
    return {
      title: projectItem?.title || "",
      url: "",
      sourceType: "remote",
      linkId,
    };
  }

  return {
    title: projectItem?.title || "",
    url: "",
    sourceType: "remote",
    linkId,
  };
};

export default useProjectWebLinkMeta;
