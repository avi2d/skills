import preset, { unitTestFiles } from "@avi2dg/checks/stryker.preset.js";

export default {
  ...preset,
  bun: {
    ...preset.bun,
    testFiles: unitTestFiles(),
  },
  // In place, a mutant can send a test process's output into the generated/ tree the harnesses load, and Stryker never restores it.
  inPlace: false,
  ignorePatterns: ["/tsconfig.json", "/generated", "/generated-*", "/repos/*"],
  // No type checker runs, and the `// @ts-nocheck` this would prepend changes every committed JavaScript file a test compares byte for byte.
  disableTypeChecks: false,
};
