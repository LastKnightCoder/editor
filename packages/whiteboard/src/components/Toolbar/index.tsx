import { Fragment, memo } from "react";
import { ChromeBar, ChromeGap } from "../../chrome";
import { useBoard } from "../../hooks/useBoard";
import usePresentationState from "../../hooks/usePresentationState";

const Toolbar = memo(() => {
  const board = useBoard();
  const { isPresentationMode } = usePresentationState();
  if (isPresentationMode) return null;
  const tools = board.extensions?.tools ?? [];
  return (
    <ChromeBar className="left-1/2 top-3 -translate-x-1/2">
      {tools.map((tool, index) => (
        <Fragment key={tool.id}>
          {index > 0 && tools[index - 1].group !== tool.group && <ChromeGap />}
          <tool.component
            run={payload => {
              void board.extensions!.execute(tool.command, payload).catch(() => {});
            }}
          />
        </Fragment>
      ))}
    </ChromeBar>
  );
});
export default Toolbar;
