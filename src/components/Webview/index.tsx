import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
  CSSProperties,
  memo,
  useState,
} from "react";

import { convertFileSrc, getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";
import { WebLinkSourceType } from "@/types";

export interface WebviewRef {
  getTitle: () => string;
  getURL: () => string;
  getHTML: () => Promise<string>;
  reload: () => void;
  stop: () => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
}

import styles from "./index.module.less";

interface WebviewProps {
  src?: string;
  className?: string;
  style?: CSSProperties;
  preload?: string;
  allowPopups?: boolean;
  userAgent?: string;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onTitleChange?: (title: string) => void;
  onURLChange?: (url: string) => void;
  sourceType?: WebLinkSourceType;
}

const Webview = forwardRef<WebviewRef, WebviewProps>((props, ref) => {
  const {
    src,
    className,
    style,
    preload,
    allowPopups = false,
    userAgent,
    onLoad,
    onError,
    onTitleChange,
    onURLChange,
    sourceType,
  } = props;

  const cdnSrc = useGithubCdnUrl(src);
  const sourceToResolve = cdnSrc ?? src;
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const resolveLocalFile = async (path: string) => {
      const homeDir = await getHomeDir();
      const absolutePath = path.startsWith("~")
        ? `${homeDir}${path.slice(1)}`
        : path;
      const fileSrc = await convertFileSrc(absolutePath);
      if (!cancelled) {
        setResolvedSrc(fileSrc);
      }
    };

    const resolveSrc = async () => {
      if (!sourceToResolve) {
        setResolvedSrc(undefined);
        return;
      }

      const trimmedSrc = sourceToResolve.trim();
      const isHttp = /^https?:\/\//i.test(trimmedSrc);
      const currentSourceType: WebviewProps["sourceType"] =
        sourceType ?? undefined;

      if (isHttp) {
        if (currentSourceType === "local") {
          try {
            const localPath = await remoteResourceToLocal(trimmedSrc);
            await resolveLocalFile(localPath);
          } catch (error) {
            console.error("下载 Webview 资源失败:", error);
            if (!cancelled) {
              setResolvedSrc(trimmedSrc);
            }
          }
          return;
        }
        setResolvedSrc(trimmedSrc);
        return;
      }

      if (
        /^[a-zA-Z]+:\/\//.test(trimmedSrc) ||
        trimmedSrc.startsWith("data:") ||
        trimmedSrc.startsWith("blob:")
      ) {
        setResolvedSrc(trimmedSrc);
        return;
      }

      try {
        await resolveLocalFile(trimmedSrc);
      } catch (error) {
        console.error("转换 Webview 路径失败:", error);
        if (!cancelled) {
          setResolvedSrc(trimmedSrc);
        }
      }
    };

    resolveSrc();

    return () => {
      cancelled = true;
    };
  }, [sourceToResolve, sourceType]);

  useImperativeHandle(ref, () => ({
    getTitle: () => {
      return webviewRef.current?.getTitle() || "";
    },
    getURL: () => {
      return webviewRef.current?.getURL() || "";
    },
    getHTML: async () => {
      return (
        (await webviewRef.current?.executeJavaScript(
          "document.documentElement.outerHTML",
        )) || ""
      );
    },
    reload: () => {
      webviewRef.current?.reload();
    },
    stop: () => {
      webviewRef.current?.stop();
    },
    goBack: () => {
      if (webviewRef.current?.canGoBack()) {
        webviewRef.current?.goBack();
      }
    },
    goForward: () => {
      if (webviewRef.current?.canGoForward()) {
        webviewRef.current?.goForward();
      }
    },
    canGoBack: () => {
      return !!webviewRef.current?.canGoBack();
    },
    canGoForward: () => {
      return !!webviewRef.current?.canGoForward();
    },
  }));

  useEffect(() => {
    const handleWebviewReady = () => {
      if (onLoad) {
        onLoad();
      }
    };

    const webview = webviewRef.current;
    if (webview) {
      webview.addEventListener("dom-ready", handleWebviewReady);

      webview.addEventListener("did-fail-load", (e) => {
        if (onError) {
          onError(new Error(`Failed to load: ${e.errorDescription}`));
        }
      });

      webview.addEventListener("page-title-updated", (e) => {
        if (onTitleChange) {
          onTitleChange(e.title);
        }
      });

      webview.addEventListener("did-navigate", (e) => {
        if (onURLChange) {
          onURLChange(e.url);
        }
      });
    }

    return () => {
      if (webview) {
        webview.removeEventListener("dom-ready", handleWebviewReady);
      }
    };
  }, [onLoad, onError, onTitleChange, onURLChange]);

  return (
    <div
      className={`${styles.webviewContainer} ${className || ""}`}
      style={style}
    >
      <webview
        ref={webviewRef as React.RefObject<HTMLWebViewElement>}
        src={resolvedSrc}
        className={styles.webview}
        preload={preload}
        allowpopups={allowPopups}
        useragent={userAgent}
        webpreferences="sandbox=true,contextIsolation=true,enableRemoteModule=false,nodeIntegration=false"
        partition="persist:main"
      />
    </div>
  );
});

export default memo(Webview);
