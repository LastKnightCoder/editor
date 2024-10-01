import { Point } from "../../types";

interface ArrowActivePointProps {
  point: Point;
  innerSize?: number;
  innerFill?: string;
  outerSize?: number;
  outerFill?: string;
}

const ArrowActivePoint = (props: ArrowActivePointProps) => {
  const { point, innerSize = 4, innerFill = '#FFFFFF', outerSize = 6, outerFill } = props;
  return (
    <>
      <circle
        cx={point.x}
        cy={point.y}
        r={outerSize}
        fill={outerFill}
      />
      <circle
        cx={point.x}
        cy={point.y}
        r={innerSize}
        fill={innerFill}
      />
    </>
  )
}

export default ArrowActivePoint;