import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
  CSSProperties,
  memo,
  useState,
} from "react";

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

export interface WebviewProps {
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
  sourceType?: "local" | "remote" | "url" | "youtube" | "bilibili";

  convertFileSrc?: (path: string) => Promise<string>;
  getHomeDir?: () => Promise<string>;
  remoteResourceToLocal?: (url: string) => Promise<string>;
  useGithubCdnUrl?: (url?: string) => string | null | undefined;
}

const isElectron = typeof window !== "undefined" && !!(window as any).electron;

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
    convertFileSrc,
    getHomeDir,
    remoteResourceToLocal,
    useGithubCdnUrl = () => null,
  } = props;

  const cdnSrc = useGithubCdnUrl(src);
  const sourceToResolve = cdnSrc ?? src;

  const webviewRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const resolveLocalFile = async (path: string) => {
      if (!getHomeDir || !convertFileSrc) {
        setResolvedSrc(path);
        return;
      }

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

      if (isHttp) {
        if (sourceType === "local" && remoteResourceToLocal) {
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
  }, [
    sourceToResolve,
    sourceType,
    convertFileSrc,
    getHomeDir,
    remoteResourceToLocal,
  ]);

  useImperativeHandle(ref, () => ({
    getTitle: () => {
      if (isElectron && webviewRef.current) {
        return webviewRef.current.getTitle?.() || "";
      }
      if (iframeRef.current) {
        try {
          return iframeRef.current.contentDocument?.title || "";
        } catch {
          return "";
        }
      }
      return "";
    },
    getURL: () => {
      if (isElectron && webviewRef.current) {
        return webviewRef.current.getURL?.() || "";
      }
      if (iframeRef.current) {
        return iframeRef.current.src || "";
      }
      return "";
    },
    getHTML: async () => {
      if (isElectron && webviewRef.current) {
        return (
          (await webviewRef.current.executeJavaScript?.(
            "document.documentElement.outerHTML",
          )) || ""
        );
      }
      if (iframeRef.current) {
        try {
          return (
            iframeRef.current.contentDocument?.documentElement.outerHTML || ""
          );
        } catch {
          return "";
        }
      }
      return "";
    },
    reload: () => {
      if (isElectron && webviewRef.current) {
        webviewRef.current.reload?.();
      }
    },
    stop: () => {
      if (isElectron && webviewRef.current) {
        webviewRef.current.stop?.();
      } else if (iframeRef.current) {
        (iframeRef.current.contentWindow as any)?.stop?.();
      }
    },
    goBack: () => {
      if (isElectron && webviewRef.current?.canGoBack?.()) {
        webviewRef.current.goBack?.();
      } else if (iframeRef.current) {
        iframeRef.current.contentWindow?.history.back();
      }
    },
    goForward: () => {
      if (isElectron && webviewRef.current?.canGoForward?.()) {
        webviewRef.current.goForward?.();
      } else if (iframeRef.current) {
        iframeRef.current.contentWindow?.history.forward();
      }
    },
    canGoBack: () => {
      if (isElectron && webviewRef.current) {
        return !!webviewRef.current.canGoBack?.();
      }
      return false;
    },
    canGoForward: () => {
      if (isElectron && webviewRef.current) {
        return !!webviewRef.current.canGoForward?.();
      }
      return false;
    },
  }));

  useEffect(() => {
    if (isElectron && webviewRef.current) {
      const webview = webviewRef.current;

      const handleWebviewReady = () => {
        webview.executeJavaScript?.(`
          document.addEventListener('contextmenu', (e) => {
            e.stopPropagation();
          }, true);
        `);
        onLoad?.();
      };

      webview.addEventListener?.("dom-ready", handleWebviewReady);

      webview.addEventListener?.("did-fail-load", (event: any) => {
        onError?.(
          new Error(
            `Failed to load: ${event.errorDescription ?? "unknown error"}`,
          ),
        );
      });

      webview.addEventListener?.("page-title-updated", (event: any) => {
        onTitleChange?.(event.title ?? "");
      });

      webview.addEventListener?.("did-navigate", (event: any) => {
        onURLChange?.(event.url ?? "");
      });

      return () => {
        webview.removeEventListener?.("dom-ready", handleWebviewReady);
      };
    } else if (iframeRef.current) {
      const iframe = iframeRef.current;

      const handleLoad = () => {
        onLoad?.();
      };

      const handleError = () => {
        onError?.(new Error("Failed to load iframe"));
      };

      iframe.addEventListener("load", handleLoad);
      iframe.addEventListener("error", handleError);

      return () => {
        iframe.removeEventListener("load", handleLoad);
        iframe.removeEventListener("error", handleError);
      };
    }
  }, [onLoad, onError, onTitleChange, onURLChange, resolvedSrc]);

  if (isElectron) {
    return (
      <div className={className} style={style}>
        <webview
          key={resolvedSrc}
          ref={webviewRef as any}
          src={resolvedSrc}
          style={{ width: "100%", height: "100%" }}
          preload={preload}
          {...(allowPopups ? { allowpopups: true } : {})}
          useragent={userAgent}
          webpreferences="sandbox=true,contextIsolation=true,enableRemoteModule=false,nodeIntegration=false"
          partition="persist:main"
        />
      </div>
    );
  } else {
    return (
      <iframe
        ref={iframeRef}
        src={resolvedSrc}
        className={className}
        style={{ width: "100%", height: "100%", border: "none", ...style }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="webview"
      />
    );
  }
});

Webview.displayName = "Webview";

export default memo(Webview);
