import React, { useRef, useState, memo } from "react";
import { message, Modal, Popover, Spin, Typography } from "antd";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import { MdMoreVert } from "react-icons/md";
import { CalendarOutlined } from "@ant-design/icons";
import classnames from "classnames";
import { useShallow } from "zustand/react/shallow";

import useTheme from "@/hooks/useTheme.ts";
import useWhiteBoardStore from "@/stores/useWhiteBoardStore.ts";
import useUploadResource from "@/hooks/useUploadResource.ts";

import { WhiteBoard } from "@/types";
import LocalImage from "@/components/LocalImage";
import { formatDate } from "@/utils";

import styles from "./index.module.less";

interface WhiteBoardCardProps {
  whiteBoard: WhiteBoard;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

const { Text, Paragraph } = Typography;
const allThemes = [
  styles.green,
  styles.blue,
  styles.red,
  styles.yellow,
  styles.purple,
];
const defaultSnapshot =
  "https://d2hulr7xnfjroe.cloudfront.net/Frame_1321315996_35405ab097.png";

const WhiteBoardCard = memo((props: WhiteBoardCardProps) => {
  const { whiteBoard, className, style, onClick } = props;

  const { isDark } = useTheme();
  const [settingOpen, setSettingOpen] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const fileUploadRef = useRef<HTMLInputElement>(null);

  const { updateWhiteBoard, deleteWhiteBoard } = useWhiteBoardStore(
    useShallow((state) => ({
      updateWhiteBoard: state.updateWhiteBoard,
      deleteWhiteBoard: state.deleteWhiteBoard,
    })),
  );

  const uploadResource = useUploadResource();

  const randomTheme = allThemes[whiteBoard.id % allThemes.length];
  const cardClassName = classnames(
    styles.cardContainer,
    randomTheme,
    {
      [styles.dark]: isDark,
    },
    className,
  );

  const handleUploadFileChange = useMemoizedFn(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files) {
        return;
      }
      const file = files[0];
      if (file.size > 1024 * 1024 * 5) {
        message.error("文件大小超过5M");
        return;
      }
      setBannerUploading(true);
      const url = await uploadResource(file);
      if (!url) {
        setBannerUploading(false);
        message.error("上传失败");
        return;
      }
      const newWhiteBoard = produce(whiteBoard, (draft) => {
        draft.snapshot = url;
      });
      await updateWhiteBoard(newWhiteBoard);
      setBannerUploading(false);
    },
  );

  const handleDeleteWhiteBoard = () => {
    Modal.confirm({
      title: "确定删除该白板？",
      onOk: async () => {
        await deleteWhiteBoard(whiteBoard.id);
      },
      okText: "确定",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
    });
    setSettingOpen(false);
  };

  return (
    <Spin spinning={bannerUploading}>
      <div className={cardClassName} style={style}>
        <div className={styles.imageContainer}>
          <LocalImage url={whiteBoard.snapshot || defaultSnapshot} />
          <div className={classnames(styles.operate)}>
            <Popover
              open={settingOpen}
              onOpenChange={setSettingOpen}
              placement={"bottomRight"}
              trigger={"click"}
              styles={{
                body: {
                  padding: 4,
                },
              }}
              content={
                <div className={styles.settings}>
                  <div
                    className={styles.settingItem}
                    onClick={handleDeleteWhiteBoard}
                  >
                    删除白板
                  </div>
                  <div
                    className={styles.settingItem}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettingOpen(false);
                      fileUploadRef.current?.click();
                    }}
                  >
                    换背景图
                  </div>
                  <input
                    ref={fileUploadRef}
                    type={"file"}
                    accept={"image/*"}
                    hidden
                    onChange={handleUploadFileChange}
                  />
                </div>
              }
            >
              <MdMoreVert />
            </Popover>
          </div>
        </div>
        <div className={styles.content}>
          <Text
            className={styles.title}
            ellipsis={{ tooltip: whiteBoard.title }}
            onClick={onClick}
          >
            {whiteBoard.title}
          </Text>
          <div className={styles.time}>
            <div className={styles.time}>
              <CalendarOutlined />
              <span className={styles.date}>
                发表于：{formatDate(whiteBoard.createTime, true)}
              </span>
            </div>
          </div>
          <Paragraph style={{ marginTop: 10 }} ellipsis={{ rows: 2 }}>
            {whiteBoard.description}
          </Paragraph>
        </div>
      </div>
    </Spin>
  );
});

export default WhiteBoardCard;
