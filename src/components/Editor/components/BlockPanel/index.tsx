import List from './List';
import useBlockPanelStore from "../../stores/useBlockPanelStore.ts";
import { useEffect, useMemo } from "react";
import IExtension from "@/components/Editor/extensions/types.ts";

interface IBlockPanelProps {
  extensions: IExtension[];
}

const BlockPanel = (props: IBlockPanelProps) => {
  const { extensions } = props;

  const blockPanelList = useMemo(() => {
    return extensions.map(extension => extension.getBlockPanelItems()).flat();
  }, [extensions]);

  const {
    blockPanelVisible,
    position,
    inputValue,
    list,
    filterList,
  } = useBlockPanelStore(state => ({
    blockPanelVisible: state.blockPanelVisible,
    position: state.position,
    list: state.list,
    inputValue: state.inputValue,
    filterList: state.filterList,
  }));

  useEffect(() => {
    filterList(inputValue, blockPanelList);
  }, [inputValue, filterList, blockPanelList]);

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
    <div style={{ position: 'fixed', left, top, zIndex: 10 }}>
      <List />
    </div>
  )
}

export default BlockPanel;