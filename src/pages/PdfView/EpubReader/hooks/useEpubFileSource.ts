import { useEffect, useMemo, useState } from "react";
import { readBinaryFile } from "@/commands";
import { Epub } from "@/types";
import { remoteResourceToLocal } from "@/utils";

interface EpubFileSourceState {
  status: "idle" | "loading" | "success" | "error";
  epubFile?: File;
  resolvedPath?: string;
  error?: Error;
}

export const useEpubFileSource = (epub?: Epub | null) => {
  const [state, setState] = useState<EpubFileSourceState>({
    status: "idle",
  });

  const cacheKey = useMemo(() => {
    if (!epub) return "none";
    return `${epub.id}-${epub.updateTime}`;
  }, [epub]);

  useEffect(() => {
    if (!epub) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    const load = async () => {
      const targetPath = epub.isLocal
        ? epub.filePath
        : epub.remoteUrl
          ? await remoteResourceToLocal(epub.remoteUrl)
          : "";

      if (!targetPath) {
        throw new Error("无法定位 EPUB 文件");
      }

      const binary = await readBinaryFile(targetPath);
      const epubFile = new File([new Uint8Array(binary)], epub.fileName, {
        type: "application/epub+zip",
      });

      if (!cancelled) {
        setState({
          status: "success",
          epubFile,
          resolvedPath: targetPath,
        });
      }
    };

    load().catch((error) => {
      if (cancelled) return;
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      setState({
        status: "error",
        error: normalizedError,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, epub]);

  return state;
};

export type UseEpubFileSourceReturn = ReturnType<typeof useEpubFileSource>;
