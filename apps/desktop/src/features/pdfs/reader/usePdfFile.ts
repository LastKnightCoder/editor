/**
 * 读出 PDF 文件字节给引擎：本地直接读，远程先缓存到本地。按 id + updateTime 分 key（改名、换位置、
 * 上传后 updateTime 变化即重读）；不留缓存——字节可能很大，且会被引擎转移给 worker。
 */

import { useQuery } from "@tanstack/react-query";
import type { PdfFile } from "@embedpdf/models";
import { readBinaryFile } from "@/commands";
import type { Pdf } from "@/types";
import { resolvePdfPath, useDatabaseReady } from "../queries";

/** 拷一份独立的 ArrayBuffer：readBinaryFile 返回的视图可能落在更大的共享缓冲上 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export interface PdfFileSource {
  pdfFile: PdfFile | null;
  resolvedPath: string | null;
  error: Error | null;
}

export function usePdfFile(pdf: Pdf): PdfFileSource {
  const { database } = useDatabaseReady();
  const query = useQuery({
    queryKey: ["pdfs", "file", database, pdf.id, pdf.updateTime],
    queryFn: async () => {
      const resolvedPath = await resolvePdfPath(pdf);
      const bytes = await readBinaryFile(resolvedPath);
      const pdfFile: PdfFile = {
        id: `pdf-${pdf.id}`,
        name: pdf.fileName,
        content: toArrayBuffer(bytes),
      };
      return { pdfFile, resolvedPath };
    },
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    structuralSharing: false,
  });
  return {
    pdfFile: query.data?.pdfFile ?? null,
    resolvedPath: query.data?.resolvedPath ?? null,
    error: query.error ? (query.error as Error) : null,
  };
}
