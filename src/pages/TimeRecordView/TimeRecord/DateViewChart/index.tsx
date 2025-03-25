import { ITimeRecord } from "@/types";
import ColumnStatistic from "../ColumnStatistic";
import PieStatistic from "../PieStatistic";
import { Card, Col, Row } from "antd";
import { memo } from "react";

interface DateViewChartProps {
  timeRecords: ITimeRecord[];
}

const DateViewChart = memo((props: DateViewChartProps) => {
  const { timeRecords } = props;

  return (
    <Row gutter={[16, 16]}>
      <Col sm={24} md={24} xxl={12}>
        <Card style={{ height: "100%" }}>
          <PieStatistic timeRecords={timeRecords} />
        </Card>
      </Col>
      <Col sm={24} md={24} xxl={12}>
        <Card style={{ height: "100%" }}>
          <ColumnStatistic timeRecords={timeRecords} />
        </Card>
      </Col>
    </Row>
  );
});

export default DateViewChart;
