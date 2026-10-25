module.exports = {
  "*.{js,jsx,ts,tsx,mts,cts,mjs,cjs}": [
    "oxlint --fix --no-error-on-unmatched-pattern",
    "oxfmt --write --no-error-on-unmatched-pattern",
  ],
  "*.{json,css,less,scss,md,yml,yaml}": ["oxfmt --write --no-error-on-unmatched-pattern"],
};
