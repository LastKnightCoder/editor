interface IColorItemProps {
  backgroundColor: string;
  borderColor: string;
  onClick: (e: React.MouseEvent) => void;
  active?: boolean;
}

const ColorItem = (props: IColorItemProps) => {
  const { backgroundColor, borderColor, onClick, active } = props;

  return (
    <div
      style={{
        padding: 2,
        border: active ? `2px solid #1a66ff` : "2px solid transparent",
        borderRadius: 8,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          backgroundColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 8,
          width: 20,
          height: 20,
        }}
        onClick={onClick}
      />
    </div>
  );
};

export default ColorItem;
