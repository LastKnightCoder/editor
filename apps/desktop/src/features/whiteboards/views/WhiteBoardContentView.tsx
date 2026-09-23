import { useEffect, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { debounce } from "lodash";
import { Loading } from "@tau/ui";
import WhiteBoard from "@/components/WhiteBoard";
import { usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import type { WhiteBoardContent } from "@/types";
import { useWhiteBoardContent } from "../queries";

export function WhiteBoardContentView() {
  const { id } = usePageParams<{ id: number }>();
  return <Content key={id} id={id} />;
}

function Content({ id }: { id: number }) {
  const { data: content, isPending, isError, save } = useWhiteBoardContent(id);
  const title = useMemo(() => <span>{content?.name || "白板"}</span>, [content?.name]);
  usePageBreadcrumb("whiteboard-content", title);
  const persist = useMemoizedFn((data: WhiteBoardContent["data"]) => {
    if (!content) return;
    save.mutate({ ...content, data });
  });
  const onChange = useMemo(() => debounce(persist, 400), [persist]);
  useEffect(
    () => () => {
      onChange.flush();
    },
    [onChange]
  );

  if (isPending) return <Loading />;
  if (isError || !content) return <div className="text-ink-2 p-6">白板不存在或读取失败</div>;
  return (
    <WhiteBoard
      key={content.id}
      className="h-full w-full"
      initData={content.data.children}
      initSelection={content.data.selection}
      initViewPort={content.data.viewPort}
      initPresentationSequences={content.data.presentationSequences}
      whiteboardContentId={content.id}
      onChange={onChange}
    />
  );
}
