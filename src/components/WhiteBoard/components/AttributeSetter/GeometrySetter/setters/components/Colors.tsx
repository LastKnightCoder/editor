import { ColorOption } from "../ColorSetter";

interface ColorsProps {
  colors: ColorOption[];
  onClick: (color: ColorOption) => void;
}

const Colors = ({ colors, onClick }: ColorsProps) => {
  return (
    <div className="grid grid-cols-4 gap-2">
      {colors.map((color) => (
        <div
          key={`${color.fill}-${color.stroke}-${color.color}`}
          className="w-25 h-12 rounded-xl flex items-center justify-center cursor-pointer"
          style={{
            backgroundColor: color.fill,
            border: `2px solid ${color.stroke}`,
            color: color.color,
          }}
          onClick={() => onClick(color)}
        >
          文字
        </div>
      ))}
    </div>
  );
};

export default Colors;
