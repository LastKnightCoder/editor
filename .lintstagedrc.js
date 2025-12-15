module.exports = {
  '*.{js,jsx,ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  '*.{json,css,less,scss}': ['prettier --write'],
  '*.{json,md}': ['prettier --write'],
};
