import type { PdfIndexStatus } from "@/types";

export const shouldReusePdfIndex = ({
  force = false,
  currentState,
  currentFingerprint,
  nextFingerprint,
  currentEmbeddingFingerprint,
  nextEmbeddingFingerprint,
}: {
  force?: boolean;
  currentState: PdfIndexStatus["state"];
  currentFingerprint?: string;
  nextFingerprint: string;
  currentEmbeddingFingerprint?: string | null;
  nextEmbeddingFingerprint?: string | null;
}): boolean => {
  if (force || currentState !== "ready") {
    return false;
  }

  return (
    currentFingerprint === nextFingerprint &&
    (currentEmbeddingFingerprint || null) === (nextEmbeddingFingerprint || null)
  );
};
