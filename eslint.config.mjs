import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", ".data/**"] },
  ...coreWebVitals,
  ...typescript,
];

export default eslintConfig;
