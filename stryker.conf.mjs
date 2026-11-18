import preset, { unitTestFiles } from "@avi2dg/checks/stryker.preset.js";

export default {
  ...preset,
  mutate: [
    "{src,lib}/**/!(*.+(s|S)pec|*.+(t|T)est).+(cjs|mjs|js|ts|mts|cts|jsx|tsx|html|vue|svelte)",
    "!{src,lib}/**/__tests__/**/*.+(cjs|mjs|js|ts|mts|cts|jsx|tsx|html|vue|svelte)",
    "harness/common/glob.ts",
  ],
  bun: {
    ...preset.bun,
    testFiles: unitTestFiles(),
  },
};
