import { memo, useState } from "react";
import { Flex, Popover, Tooltip, App } from "antd";
import {
  PlayCircleOutlined,
  EditOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import For from "@/components/For";
import { PresentationSequence } from "../../../types";
import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";

interface PresentationSequenceProps {
  sequences: PresentationSequence[];
  onStartPresentation: (sequenceId: string) => void;
  onEditSequence: (sequenceId: string) => void;
  onDeleteSequence: (sequenceId: string) => void;
}

const PresentationSequenceComponent = memo<PresentationSequenceProps>(
  (props) => {
    const { sequences, onStartPresentation, onEditSequence, onDeleteSequence } =
      props;

    const [popoverOpen, setPopoverOpen] = useState(false);
    const { modal } = App.useApp();

    const stopPropagation = useMemoizedFn((e: any) => {
      e.stopPropagation();
    });

    const handlePopoverOpenChange = useMemoizedFn((open: boolean) => {
      setPopoverOpen(open);
    });

    const handleStartPresentation = useMemoizedFn((sequenceId: string) => {
      setPopoverOpen(false);
      onStartPresentation(sequenceId);
    });

    const handleEdit = useMemoizedFn(
      (e: React.MouseEvent, sequenceId: string) => {
        e.stopPropagation();
        setPopoverOpen(false);
        onEditSequence(sequenceId);
      },
    );

    const handleDelete = useMemoizedFn(
      (e: React.MouseEvent, sequenceId: string) => {
        e.stopPropagation();
        modal.confirm({
          title: "删除序列",
          content: "确定删除该序列吗？该操作无法撤销。",
          okText: "删除",
          cancelText: "取消",
          okButtonProps: { danger: true },
          onOk: () => {
            setPopoverOpen(false);
            onDeleteSequence(sequenceId);
          },
        });
      },
    );

    if (sequences.length === 0) {
      return null;
    }

    return (
      <Popover
        trigger={"click"}
        arrow={false}
        open={popoverOpen}
        onOpenChange={handlePopoverOpenChange}
        content={
          <div className={styles.sequenceList}>
            <div className={styles.listHeader}>
              <span className={styles.listTitle}>演示序列</span>
              <span className={styles.listCount}>{sequences.length}</span>
            </div>
            <For
              data={sequences}
              renderItem={(sequence) => (
                <div key={sequence.id} className={styles.sequenceItem}>
                  <span
                    onClick={() => handleStartPresentation(sequence.id)}
                    className={styles.sequenceName}
                  >
                    {sequence.name}
                  </span>
                  <Flex gap={2} className={styles.sequenceActions}>
                    <Tooltip title="编辑序列">
                      <span
                        className={styles.actionIcon}
                        onClick={(e) => handleEdit(e, sequence.id)}
                      >
                        <EditOutlined />
                      </span>
                    </Tooltip>
                    <Tooltip title="删除序列">
                      <span
                        className={`${styles.actionIcon} ${styles.deleteIcon}`}
                        onClick={(e) => handleDelete(e, sequence.id)}
                      >
                        <CloseOutlined />
                      </span>
                    </Tooltip>
                  </Flex>
                </div>
              )}
            />
          </div>
        }
        styles={{
          content: {
            padding: 0,
            marginBottom: 8,
          },
        }}
      >
        <Tooltip title="演示序列">
          <div className={styles.presentationButton} onClick={stopPropagation}>
            <PlayCircleOutlined />
          </div>
        </Tooltip>
      </Popover>
    );
  },
);

export default PresentationSequenceComponent;
