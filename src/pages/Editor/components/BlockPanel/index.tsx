import List from './List';
import useBlockPanelStore from "../../stores/useBlockPanelStore.ts";
import {useEffect, useMemo} from "react";

const BlockPanel = () => {
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
    filterList(inputValue);
  }, [inputValue, filterList]);

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

  if (!blockPanelVisible) return null;

  return (
    <div style={{ position: 'fixed', left, top }}>
      <List />
    </div>
  )
}

export default BlockPanel;