import WhiteBoard from "@/components/WhiteBoard";
import useEditWhiteBoard from "./useEditWhiteBoard";
import { useEffect } from "react";
import { useRafInterval } from "ahooks";
import { Skeleton } from "antd";

interface WhiteBoardContentProps {
  whiteBoardId: number;
}

const WhiteBoardContent = (props: WhiteBoardContentProps) => {
  const { whiteBoardId } = props;

  const { loading, whiteBoard, onChange, saveWhiteBoard } =
    useEditWhiteBoard(whiteBoardId);

  useRafInterval(() => {
    saveWhiteBoard();
  }, 3000);

  useEffect(() => {
    return () => {
      saveWhiteBoard();
    };
  }, [saveWhiteBoard]);

  if (loading) {
    return (
      <div style={{ width: "100%", height: "100%" }}>
        <Skeleton active />
      </div>
    );
  }

  if (!whiteBoard) {
    return null;
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        // padding: 16,
        boxSizing: "border-box",
      }}
    >
      <WhiteBoard
        key={whiteBoard.id}
        style={{ width: "100%", height: "100%" }}
        initData={whiteBoard.data.children}
        initViewPort={whiteBoard.data.viewPort}
        initSelection={whiteBoard.data.selection}
        initPresentationSequences={whiteBoard.data.presentationSequences || []}
        onChange={onChange}
      />
    </div>
  );
};

export default WhiteBoardContent;
