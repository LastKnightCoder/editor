import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import Titlebar from "@/layouts/components/Titlebar";
import { Breadcrumb } from "antd";
import { getWhiteboardByIds } from "@/commands";
import EditWhiteBoard from "./EditWhiteBoard";
import { WhiteBoard } from "@/types";

import styles from "./index.module.less";

const WhiteboardDetailView = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const [whiteBoard, setWhiteBoard] = useState<WhiteBoard | null>(null);
  const [prevWhiteBoards, setPrevWhiteBoards] = useState<WhiteBoard[]>([]);

  const [prevWhiteBoardIds] = useState<number[]>(() => {
    const prevWhiteBoardIds = searchParams.get("prevWhiteBoardIds");
    let ids: number[] = [];
    try {
      ids = JSON.parse(prevWhiteBoardIds || "[]");
    } catch (error) {
      console.error(error);
    }
    return ids;
  });

  useEffect(() => {
    getWhiteboardByIds([Number(id), ...prevWhiteBoardIds]).then(
      (whiteBoards) => {
        setWhiteBoard(whiteBoards.find((wb) => wb.id === Number(id)) || null);
        const prevWhiteBoards = prevWhiteBoardIds
          .map((id) => {
            const whiteBoard = whiteBoards.find((wb) => wb.id === id);
            if (whiteBoard) {
              return whiteBoard;
            }
          })
          .filter((wb) => wb !== undefined);
        setPrevWhiteBoards(prevWhiteBoards);
      },
    );
  }, [prevWhiteBoardIds, id]);

  const navigate = useNavigate();
  const breadcrumbItems = useMemo(
    () => [
      {
        title: "首页",
        onClick: () => {
          navigate("/");
        },
      },
      {
        title: "白板列表",
        onClick: () => {
          navigate("/white-board/list");
        },
      },
      ...prevWhiteBoards.map((whiteBoard) => ({
        title: whiteBoard.title,
        onClick: () => {
          navigate(`/white-board/detail/${whiteBoard.id}`);
        },
      })),
      {
        title: whiteBoard?.title || `白板 #${id}`,
        onClick: () => {
          navigate(`/white-board/detail/${id}`);
        },
      },
    ],
    [prevWhiteBoards, whiteBoard, id, navigate],
  );

  if (!id) {
    return null;
  }

  return (
    <div className={styles.container}>
      <Titlebar className={styles.titlebar}>
        <Breadcrumb
          className={styles.breadcrumb}
          items={breadcrumbItems.map((item) => ({
            title: (
              <span className={styles.breadcrumbItem} onClick={item.onClick}>
                {item.title}
              </span>
            ),
          }))}
        />
      </Titlebar>
      <div className={styles.whiteboardContainer}>
        <EditWhiteBoard whiteBoardId={Number(id)} />
      </div>
    </div>
  );
};

export default WhiteboardDetailView;
