import { memo, useState } from "react";
import { Popover } from "antd";
import SVG from "react-inlinesvg";
import { useMemoizedFn } from "ahooks";

import geometryIcon from "@/assets/white-board/geometry.svg";

import { geometryItems } from "./config";
import useCreateGeometry from "./useCreateGeometry";

import { ECreateBoardElementType } from "../../../types";
import { useBoard, useCreateElementType } from "../../../hooks";
import { transformPath } from "../../../utils";

import styles from "./index.module.less";

interface GeometryProps {
  className?: string;
  style?: React.CSSProperties;
}

const Geometry = memo((props: GeometryProps) => {
  const { className, style } = props;

  const board = useBoard();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const createElementType = useCreateElementType();

  useCreateGeometry();

  const handleClickGeometryItem = useMemoizedFn((item) => {
    board.createOptions = {
      ...item,
      geometryType: item.geometryType,
      defaultExtraInfo: item.defaultExtraInfo || {},
    };
    setPopoverOpen(false);
  });

  return (
    <Popover
      open={popoverOpen}
      onOpenChange={(open) => {
        setPopoverOpen(open);
      }}
      trigger={"click"}
      placement="bottom"
      content={
        <div className={styles.popoverContainer}>
          <div className={styles.list}>
            {geometryItems.map((item) => (
              <div
                className={styles.item}
                key={item.name}
                onClick={() => {
                  handleClickGeometryItem(item);
                }}
              >
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 16 16"
                  style={{ overflow: "visible" }}
                >
                  {item.paths.map((path, index) => {
                    const pathString = transformPath(path, 16, 16);
                    return (
                      <path
                        d={pathString}
                        key={index}
                        fill="none"
                        strokeWidth="2"
                        stroke={"currentColor"}
                      />
                    );
                  })}
                </svg>
              </div>
            ))}
          </div>
        </div>
      }
      styles={{
        body: {
          padding: 8,
        },
      }}
    >
      <div
        className={className}
        style={style}
        onClick={() => {
          if (createElementType === ECreateBoardElementType.Geometry) {
            setPopoverOpen(false);
            board.currentCreateType = ECreateBoardElementType.None;
          } else {
            board.currentCreateType = ECreateBoardElementType.Geometry;
            setPopoverOpen(true);
          }
        }}
      >
        <SVG src={geometryIcon} />
      </div>
    </Popover>
  );
});

export default Geometry;
