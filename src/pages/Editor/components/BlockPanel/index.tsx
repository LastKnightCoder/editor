import List from './List';
import useBlockPanelStore from "../../stores/useBlockPanelStore.ts";
import {useEffect} from "react";

const BlockPanel = () => {
  const {
    blockPanelVisible,
    position,
    inputValue,
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

  if (!blockPanelVisible) return null;

  return (
    <div style={{ position: 'fixed', left: position.x, top: position.y }}>
      <List />
    </div>
  )
}

export default BlockPanel;