import { defineFieldModel } from "../../model/field-model";
import type { CellValue, ColumnDef } from "../../types";
import type { FormulaColumnConfig } from "@tau/shared/database-types";
import {
  FORMULA_TYPE,
  formatScalar,
  formulaConfigOf,
  isFormulaCell,
  type Scalar,
} from "../../core/formula";

const scalarOf = (value: CellValue): Scalar => (isFormulaCell(value) ? value.value : null);
const outputOf = (column: ColumnDef) => formulaConfigOf(column).output;

/**
 * 公式列的 model：值不落库、只在投影中派生，toText 接收派生后的
 * { value, error? } 形态，算不出来（error）时输出空串。
 */
export const formulaFieldModel = defineFieldModel<FormulaColumnConfig>({
  type: FORMULA_TYPE,
  valueType: column => outputOf(column),
  toScalar: value => scalarOf(value),
  toText: (value, column) => {
    if (!isFormulaCell(value) || value.error) return "";
    return formatScalar(value.value, outputOf(column));
  },
});
