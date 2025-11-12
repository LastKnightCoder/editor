import WhiteBoardContent from "./WhiteBoardContent";

interface WhiteBoardProps {
  whiteBoardId: number;
}

const WhiteBoard: React.FC<WhiteBoardProps> = ({ whiteBoardId }) => {
  if (!whiteBoardId) {
    return null;
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <WhiteBoardContent key={whiteBoardId} whiteBoardId={whiteBoardId} />
    </div>
  );
};

export default WhiteBoard;
