// 本工程是宽行风格（printWidth 200，见 .prettierrc.json）：prettier 规则改读本目录的配置，不用根配置写死的 100 列
module.exports = {
  rules: {
    "prettier/prettier": ["warn", {}, { usePrettierrc: true }],
  },
};
