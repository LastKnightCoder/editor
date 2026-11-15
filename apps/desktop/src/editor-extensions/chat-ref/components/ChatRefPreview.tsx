import { lazy, Suspense } from "react";
import { Spinner } from "@tau/ui";
import type { ChatRefPreviewProps } from "./ChatRefPreviewContent";

const Content = lazy(() =>
  import("./ChatRefPreviewContent").then(module => ({ default: module.ChatRefPreview }))
);

export function ChatRefPreview(props: ChatRefPreviewProps) {
  return (
    <Suspense fallback={<Spinner />}>
      <Content {...props} />
    </Suspense>
  );
}
