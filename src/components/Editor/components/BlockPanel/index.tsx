import { memo, useEffect, useMemo, useRef } from "react";
import List from "./List";
import IExtension from "@/components/Editor/extensions/types.ts";
import PortalToBody from "@/components/PortalToBody";

import useBlockPanelStore from "../../stores/useBlockPanelStore.ts";

interface IBlockPanelProps {
  extensions: IExtension[];
}

const BlockPanel = memo((props: IBlockPanelProps) => {
  const { extensions } = props;

  const blockPanelList = useMemo(() => {
    return extensions.map((extension) => extension.getBlockPanelItems()).flat();
  }, [extensions]);

  const { blockPanelVisible, position, inputValue, list, filterList, reset } =
    useBlockPanelStore((state) => ({
      blockPanelVisible: state.blockPanelVisible,
      position: state.position,
      list: state.list,
      inputValue: state.inputValue,
      filterList: state.filterList,
      reset: state.reset,
    }));

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    filterList(inputValue, blockPanelList);
  }, [inputValue, filterList, blockPanelList]);

  // 点击外部关闭面板
  useEffect(() => {
    if (!blockPanelVisible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        reset();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [blockPanelVisible, reset]);

  const [left, top] = useMemo(() => {
    const pageHeight = document.body.clientHeight;
    const bottom = pageHeight - position.y;
    const length = list.length;
    const height = Math.min(length * 40, 300);

    if (bottom < height) {
      return [position.x + 10, position.y - height];
    }

    return [position.x + 10, position.y];
  }, [position, list]);

  if (!blockPanelVisible || list.length === 0) return null;

  return (
    <PortalToBody>
      <div
        ref={panelRef}
        className="fixed rounded-2xl bg-white/60 dark:bg-[rgba(30,30,30,0.6)] backdrop-blur-md backdrop-saturate-150 border border-white/30 dark:border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          zIndex: 9999,
        }}
      >
        <List />
      </div>
    </PortalToBody>
  );
});

export default BlockPanel;
