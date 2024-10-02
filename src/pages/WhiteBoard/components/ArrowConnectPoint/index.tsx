interface ArrowConnectPointProps {
  position: string;
  x: number;
  y: number;
  r: number;
  fill: string;
  fillOpacity?: number;
}

const ArrowConnectPoint = (props: ArrowConnectPointProps) => {
  const { position, x, y, r, fill, fillOpacity = 0.8 } = props;

  return (
    <circle
      cx={x}
      cy={y}
      r={r}
      fill={fill}
      fillOpacity={fillOpacity}
    />
  )
}

export default ArrowConnectPoint;
