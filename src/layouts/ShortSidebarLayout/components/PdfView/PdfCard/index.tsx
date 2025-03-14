import React, { useState } from "react";
import classnames from "classnames";
import { Popover, App, Tag } from "antd";

import { MdMoreVert } from "react-icons/md";
import useTheme from "@/hooks/useTheme.ts";
import usePdfsStore from "@/stores/usePdfsStore.ts";
import { Pdf } from "@/types";

import styles from "./index.module.less";

interface PdfCardProps {
  pdf: Pdf;
  className?: string;
  style?: React.CSSProperties;
}

const PdfCard = (props: PdfCardProps) => {
  const { className, style, pdf } = props;

  const { modal } = App.useApp();
  const { isDark } = useTheme();
  const [settingOpen, setSettingOpen] = useState(false);

  const { removePdf, activePdf } = usePdfsStore((state) => ({
    removePdf: state.removePdf,
    activePdf: state.activePdf,
  }));

  const onRemovePdf = () => {
    modal.confirm({
      title: "删除PDF",
      content: "确定删除该PDF吗？",
      onOk: async () => {
        await removePdf(pdf.id);
        if (activePdf?.id === pdf.id) {
          usePdfsStore.setState({
            activePdf: null,
          });
        }
      },
      cancelText: "取消",
      okText: "确定",
      okButtonProps: {
        danger: true,
      },
    });
  };

  const onClick = () => {
    usePdfsStore.setState({
      activePdf: pdf.id === activePdf?.id ? null : pdf,
    });
  };

  return (
    <div
      className={classnames(
        styles.cardContainer,
        { [styles.dark]: isDark },
        className,
      )}
      style={style}
    >
      <div className={styles.title} onClick={onClick}>
        {pdf.fileName}
      </div>
      <div className={styles.tag}>
        <Tag color={pdf.isLocal ? "blue" : "red"}>
          {pdf.isLocal ? "本地" : "远程"}
        </Tag>
      </div>
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
              <div className={styles.settingItem} onClick={onRemovePdf}>
                删除Pdf
              </div>
            </div>
          }
        >
          <MdMoreVert />
        </Popover>
      </div>
    </div>
  );
};

export default PdfCard;
