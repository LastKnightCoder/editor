import { useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from "uuid";
import {
  Modal,
  Input,
  Upload,
  message as antdMessage,
  List,
  Empty,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd";

import Board from "../../Board";
import { ECreateBoardElementType } from "../../types";
import { WhiteBoardElement } from "../../plugins/WhiteBoardPlugin";
import { WhiteBoard as IWhiteBoard, WhiteBoardContent } from "@/types";
import {
  createWhiteBoardContent,
  getAllWhiteBoards,
} from "@/commands/white-board";
import useUploadResource from "@/hooks/useUploadResource";
import SelectWhiteBoardModal from "@/components/SelectWhiteBoardModal";

interface WhiteBoardSelectorModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
  action?: "create" | "reference";
}

const WhiteBoardSelectorModal = ({
  open,
  onClose,
  board,
  action = "create",
}: WhiteBoardSelectorModalProps) => {
  // Create modal state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);

  // Reference modal state
  const [allWhiteBoards, setAllWhiteBoards] = useState<IWhiteBoard[]>([]);
  const [selectedWhiteBoards, setSelectedWhiteBoards] = useState<IWhiteBoard[]>(
    [],
  );
  const [selectWhiteBoardModalOpen, setSelectWhiteBoardModalOpen] =
    useState(false);
  const [selectSubWhiteBoardModalOpen, setSelectSubWhiteBoardModalOpen] =
    useState(false);
  const [currentWhiteBoardContents, setCurrentWhiteBoardContents] = useState<
    WhiteBoardContent[]
  >([]);

  const uploadResource = useUploadResource();

  useEffect(() => {
    if (open && action === "reference") {
      setSelectWhiteBoardModalOpen(true);
      getAllWhiteBoards().then((whiteBoards) => {
        setAllWhiteBoards(whiteBoards);
      });
    }
  }, [open, action]);

  const createWhiteBoardElement = useMemoizedFn(
    (whiteBoardContent: WhiteBoardContent, whiteBoard: IWhiteBoard) => {
      const { minX, minY, width, height } = board.viewPort;
      const center = {
        x: minX + width / 2,
        y: minY + height / 2,
      };
      const whiteboardWidth = 400;
      const whiteboardHeight = 300;

      const element: WhiteBoardElement = {
        id: getUuid(),
        type: "whiteboard",
        whiteBoardContentId: whiteBoardContent.id,
        name: whiteBoardContent.name,
        description: whiteBoard.description,
        snapshot: whiteBoard.snapshot,
        x: center.x - whiteboardWidth / 2,
        y: center.y - whiteboardHeight / 2,
        width: whiteboardWidth,
        height: whiteboardHeight,
        resized: false,
        maxWidth: whiteboardWidth,
        maxHeight: whiteboardHeight,
      };

      board.apply([
        {
          type: "insert_node",
          path: [board.children.length],
          node: element,
        },
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectArea: null,
            selectedElements: [element],
          },
        },
      ]);
    },
  );

  const handleCreateOk = useMemoizedFn(async () => {
    if (!name.trim()) {
      antdMessage.error("请输入白板名称");
      return;
    }

    setLoading(true);
    try {
      let snapshotUrl: string | undefined;

      // 如果有上传图片，先上传
      if (fileList.length > 0 && fileList[0].originFileObj) {
        const result = await uploadResource(fileList[0].originFileObj);
        if (result) {
          snapshotUrl = result;
        }
      }

      // 创建新的白板内容
      const content = await createWhiteBoardContent({
        data: {
          children: [],
          viewPort: { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
          selection: { selectArea: null, selectedElements: [] },
          presentationSequences: [],
        },
        name,
        imgUrl: snapshotUrl || "",
      });

      // 创建一个临时的 WhiteBoard 对象用于传递 description 和 snapshot
      const tempWhiteBoard: IWhiteBoard = {
        id: -1,
        title: name,
        description,
        snapshot: snapshotUrl || "",
        tags: [],
        whiteBoardContentIds: [content.id],
        whiteBoardContentList: [content],
        activeWhiteBoardContentId: content.id,
        createTime: Date.now(),
        updateTime: Date.now(),
      };

      createWhiteBoardElement(content, tempWhiteBoard);
      handleCancel();
    } catch (error) {
      console.error("Create whiteboard failed:", error);
    } finally {
      setLoading(false);
    }
  });

  const handleWhiteBoardSelect = useMemoizedFn(
    async (whiteBoards: IWhiteBoard[]) => {
      if (whiteBoards.length === 0) return;

      const whiteBoard = whiteBoards[0];

      // 检查是否有多个 SubWhiteBoard
      if (
        whiteBoard.whiteBoardContentList &&
        whiteBoard.whiteBoardContentList.length > 1
      ) {
        // 有多个，显示选择弹窗
        setCurrentWhiteBoardContents(whiteBoard.whiteBoardContentList);
        setSelectWhiteBoardModalOpen(false);
        setSelectSubWhiteBoardModalOpen(true);
        // 保存选中的 whiteBoard 供后续使用
        setSelectedWhiteBoards([whiteBoard]);
      } else if (
        whiteBoard.whiteBoardContentList &&
        whiteBoard.whiteBoardContentList.length === 1
      ) {
        // 只有一个，直接创建
        createWhiteBoardElement(
          whiteBoard.whiteBoardContentList[0],
          whiteBoard,
        );
        handleCancel();
      }
    },
  );

  const handleSubWhiteBoardSelect = useMemoizedFn(
    (content: WhiteBoardContent) => {
      const whiteBoard = selectedWhiteBoards[0];
      createWhiteBoardElement(content, whiteBoard);
      handleCancel();
    },
  );

  const handleCancel = useMemoizedFn(() => {
    setName("");
    setDescription("");
    setFileList([]);
    setSelectWhiteBoardModalOpen(false);
    setSelectSubWhiteBoardModalOpen(false);
    setSelectedWhiteBoards([]);
    setCurrentWhiteBoardContents([]);
    board.currentCreateType = ECreateBoardElementType.None;
    onClose();
  });

  // Render create modal
  if (action === "create") {
    return (
      <Modal
        title="创建新白板"
        open={open}
        onCancel={handleCancel}
        onOk={handleCreateOk}
        confirmLoading={loading}
      >
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-2">名称 *</div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入白板名称"
            />
          </div>

          <div>
            <div className="mb-2">描述</div>
            <Input.TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请输入白板描述"
              rows={3}
            />
          </div>

          <div>
            <div className="mb-2">封面图</div>
            <Upload
              listType="picture-card"
              fileList={fileList}
              beforeUpload={() => false}
              onChange={({ fileList }) => setFileList(fileList.slice(-1))}
              maxCount={1}
            >
              {fileList.length === 0 && (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>上传</div>
                </div>
              )}
            </Upload>
          </div>
        </div>
      </Modal>
    );
  }

  // Render reference modals
  return (
    <>
      <SelectWhiteBoardModal
        open={selectWhiteBoardModalOpen}
        title="选择白板"
        multiple={false}
        onCancel={handleCancel}
        onChange={setSelectedWhiteBoards}
        onOk={handleWhiteBoardSelect}
        selectedWhiteBoards={selectedWhiteBoards}
        allWhiteBoards={allWhiteBoards}
      />

      <Modal
        title="选择子白板"
        open={selectSubWhiteBoardModalOpen}
        onCancel={handleCancel}
        footer={null}
        width={600}
      >
        {currentWhiteBoardContents.length > 0 ? (
          <List
            dataSource={currentWhiteBoardContents}
            renderItem={(item) => (
              <List.Item
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors px-4"
                onClick={() => handleSubWhiteBoardSelect(item)}
              >
                <div className="flex flex-col gap-1">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-sm text-gray-500">
                    创建时间: {new Date(item.createTime).toLocaleString()}
                  </div>
                </div>
              </List.Item>
            )}
          />
        ) : (
          <Empty description="该白板没有子白板" />
        )}
      </Modal>
    </>
  );
};

export default WhiteBoardSelectorModal;
