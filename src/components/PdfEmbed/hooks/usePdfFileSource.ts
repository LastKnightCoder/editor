import { useEffect, useMemo, useState } from "react";
import type { PdfFile } from "@embedpdf/models";
import { readBinaryFile } from "@/commands";
import { Pdf } from "@/types";
import { remoteResourceToLocal } from "@/utils";

interface PdfFileSourceState {
  status: "idle" | "loading" | "success" | "error";
  pdfFile?: PdfFile;
  resolvedPath?: string;
  error?: Error;
}

const sliceArrayBuffer = (buffer: Uint8Array): ArrayBuffer => {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
};

export const usePdfFileSource = (pdf?: Pdf | null) => {
  const [state, setState] = useState<PdfFileSourceState>({
    status: "idle",
  });

  const cacheKey = useMemo(() => {
    if (!pdf) return "none";
    return `${pdf.id}-${pdf.updateTime}`;
  }, [pdf]);

  useEffect(() => {
    if (!pdf) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    const load = async () => {
      const targetPath = pdf.isLocal
        ? pdf.filePath
        : pdf.remoteUrl
          ? await remoteResourceToLocal(pdf.remoteUrl)
          : "";

      if (!targetPath) {
        throw new Error("无法定位 PDF 文件");
      }

      const binary = await readBinaryFile(targetPath);
      const pdfFile: PdfFile = {
        id: `pdf-${pdf.id}`,
        name: pdf.fileName,
        content: sliceArrayBuffer(binary),
      };

      if (!cancelled) {
        setState({
          status: "success",
          pdfFile,
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
  }, [cacheKey, pdf]);

  return state;
};

export type UsePdfFileSourceReturn = ReturnType<typeof usePdfFileSource>;
