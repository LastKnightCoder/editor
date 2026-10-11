import { textFieldModel } from "../plugins/TextPlugin/model";
import { numberFieldModel } from "../plugins/NumberPlugin/model";
import { dateFieldModel } from "../plugins/DatePlugin/model";
import { selectFieldModel } from "../plugins/SelectPlugin/model";
import { multiSelectFieldModel } from "../plugins/MultiSelectPlugin/model";
import { checkboxFieldModel } from "../plugins/CheckboxPlugin/model";
import { linkFieldModel } from "../plugins/LinkPlugin/model";
import { starFieldModel } from "../plugins/StarPlugin/model";
import { progressFieldModel } from "../plugins/ProgressPlugin/model";
import { formulaFieldModel } from "../plugins/FormulaPlugin/model";

/** 10 个内置字段的 model：type 集合与 plugins 的 builtInPlugins 一致（单测守护） */
export const builtInFieldModels = [
  textFieldModel,
  numberFieldModel,
  dateFieldModel,
  selectFieldModel,
  multiSelectFieldModel,
  checkboxFieldModel,
  linkFieldModel,
  starFieldModel,
  progressFieldModel,
  formulaFieldModel,
];
