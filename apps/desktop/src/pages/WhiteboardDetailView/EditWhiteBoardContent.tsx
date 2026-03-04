import WhiteBoard from "@/components/WhiteBoard";
import WhiteBoardBreadcrumb from "./WhiteBoardBreadcrumb";
import { useEffect, useState, useRef } from "react";
import { useRafInterval, useMemoizedFn } from "ahooks";
import { Empty } from "antd";
import { WhiteBoardContent as IWhiteBoardContent } from "@/types";
import { LoadingOutlined } from "@ant-design/icons";
import {
  BoardElement,
  ViewPort,
  Selection,
  PresentationSequence,
} from "@/components/WhiteBoard";
import {
  getWhiteBoardContentById,
  updateWhiteBoardContent,
} from "@/commands/white-board";

interface EditWhiteBoardContentProps {
  whiteBoardContentId: number;
  breadcrumb: number[];
}

const EditWhiteBoardContent = (props: EditWhiteBoardContentProps) => {
  const { whiteBoardContentId, breadcrumb } = props;

  const [loading, setLoading] = useState(false);
  const [whiteBoardContent, setWhiteBoardContent] =
    useState<IWhiteBoardContent | null>(null);
  const changed = useRef(false);
  const latestDataRef = useRef<IWhiteBoardContent["data"] | null>(null);

  useEffect(() => {
    setLoading(true);
    getWhiteBoardContentById(whiteBoardContentId)
      .then((content) => {
        setWhiteBoardContent(content);
        latestDataRef.current = null;
        changed.current = false;
      })
      .catch(() => {
        setWhiteBoardContent(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [whiteBoardContentId]);

  const onWhiteBoardContentChange = useMemoizedFn(
    (data: {
      children: BoardElement[];
      viewPort: ViewPort;
      selection: Selection;
      presentationSequences?: PresentationSequence[];
    }) => {
      if (!whiteBoardContent) return;
      latestDataRef.current = data;
      changed.current = true;
    },
  );

  const saveWhiteBoardContent = useMemoizedFn(async () => {
    if (!changed.current || !whiteBoardContent) return;
    const dataToSave = latestDataRef.current ?? whiteBoardContent.data;
    const updatedContent = await updateWhiteBoardContent({
      id: whiteBoardContent.id,
      name: whiteBoardContent.name,
      imgUrl: whiteBoardContent.imgUrl,
      data: dataToSave,
    });
    setWhiteBoardContent(updatedContent);
    latestDataRef.current = null;
    changed.current = false;
  });

  useRafInterval(() => {
    saveWhiteBoardContent();
  }, 3000);

  useEffect(() => {
    return () => {
      saveWhiteBoardContent();
    };
  }, [saveWhiteBoardContent]);

  if (loading) {
    return (
      <div className="w-full h-full flex justify-center items-center">
        <LoadingOutlined className="text-2xl" />
      </div>
    );
  }

  if (!whiteBoardContent) {
    return <Empty description="白板不存在" />;
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* 面包屑导航 - 始终显示 */}
      <WhiteBoardBreadcrumb
        breadcrumb={breadcrumb}
        currentContentName={whiteBoardContent.name}
      />

      <div className="flex-1 overflow-hidden">
        <WhiteBoard
          key={whiteBoardContent.id}
          className="w-full h-full"
          initData={whiteBoardContent.data.children}
          initViewPort={whiteBoardContent.data.viewPort}
          initSelection={whiteBoardContent.data.selection}
          initPresentationSequences={
            whiteBoardContent.data.presentationSequences
          }
          onChange={onWhiteBoardContentChange}
          whiteboardContentId={whiteBoardContent.id}
        />
      </div>
    </div>
  );
};

export default EditWhiteBoardContent;
