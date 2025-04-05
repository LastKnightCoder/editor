import { memo } from "react";
import { Card, Row } from "antd";

import { ITimeRecord } from "@/types";

import ColumnStatistic from "../ColumnStatistic";
import PieStatistic from "../PieStatistic";
import ContainerCol from "@/components/ContainerCol";

interface DateViewChartProps {
  timeRecords: ITimeRecord[];
}

const DateViewChart = memo((props: DateViewChartProps) => {
  const { timeRecords } = props;

  return (
    <Row gutter={[16, 16]}>
      <ContainerCol forceRefresh md={24} xl={12}>
        <PieStatistic timeRecords={timeRecords} />
      </ContainerCol>
      <ContainerCol forceRefresh md={24} xl={12}>
        <Card style={{ height: "100%" }}>
          <ColumnStatistic timeRecords={timeRecords} />
        </Card>
      </ContainerCol>
    </Row>
  );
});

export default DateViewChart;
