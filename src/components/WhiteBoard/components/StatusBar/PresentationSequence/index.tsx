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
          <Flex vertical className={styles.sequenceList}>
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
                  <Flex gap={12} className={styles.sequenceActions}>
                    <EditOutlined
                      onClick={(e) => {
                        e.stopPropagation();
                        setPopoverOpen(false);
                        onEditSequence(sequence.id);
                      }}
                    />
                    <CloseOutlined
                      onClick={(e) => {
                        e.stopPropagation();
                        // 删除序列
                        modal.confirm({
                          title: "删除序列",
                          content: "确定删除该序列吗？",
                          onOk: () => {
                            setPopoverOpen(false);
                            onDeleteSequence(sequence.id);
                          },
                          okButtonProps: {
                            danger: true,
                          },
                        });
                      }}
                    />
                  </Flex>
                </div>
              )}
            />
          </Flex>
        }
        styles={{
          body: {
            padding: 8,
            marginBottom: 12,
          },
        }}
      >
        <Tooltip title="开始演示">
          <div className={styles.presentationButton} onClick={stopPropagation}>
            <PlayCircleOutlined />
          </div>
        </Tooltip>
      </Popover>
    );
  },
);

export default PresentationSequenceComponent;
