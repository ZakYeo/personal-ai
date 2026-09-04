import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import prettier from "eslint-config-prettier";
import importX from "eslint-plugin-import-x";
import unicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

const architectureImportPatterns = {
  adapters: [
    "../adapters/**",
    "../../adapters/**",
    "../../../adapters/**",
    "../../../../adapters/**",
  ],
  application: [
    "../application/**",
    "../../application/**",
    "../../../application/**",
    "../../../../application/**",
  ],
  core: [
    "../core/**",
    "../../core/**",
    "../../../core/**",
    "../../../../core/**",
  ],
  features: [
    "../features/**",
    "../../features/**",
    "../../../features/**",
    "../../../../features/**",
  ],
  runtimes: [
    "../runtimes/**",
    "../../runtimes/**",
    "../../../runtimes/**",
    "../../../../runtimes/**",
  ],
  testSupport: [
    "../test-support/**",
    "../../test-support/**",
    "../../../test-support/**",
    "../../../../test-support/**",
  ],
};

export default tseslint.config(
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "apps/*/dist/**",
      "apps/*/playwright-report/**",
      "apps/*/src-tauri/target/**",
      "apps/*/test-results/**",
      "node_modules/**",
      ".venv/**",
      ".vitest-attachments/**",
      ".voice-benchmark/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: [
      "src/**/*.ts",
      "test/**/*.ts",
      "apps/desktop/**/*.ts",
      "apps/desktop/**/*.tsx",
      "*.config.ts",
      "*.config.js",
    ],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.config.js"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "import-x": importX,
      unicorn,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: false },
      ],
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "import-x/first": "error",
      "import-x/newline-after-import": "error",
      "import-x/no-cycle": "error",
      "import-x/no-duplicates": "error",
      "import-x/no-self-import": "error",
      "import-x/no-useless-path-segments": ["error", { noUselessIndex: false }],
      "no-console": "error",
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Read environment variables only at runtime/config boundaries.",
        },
      ],
      "unicorn/error-message": "error",
      "unicorn/no-instanceof-builtins": "error",
      "unicorn/no-new-array": "error",
      "unicorn/no-useless-undefined": "error",
      "unicorn/no-zero-fractions": "error",
      "unicorn/number-literal-case": "error",
      "unicorn/prefer-node-protocol": "error",
      "unicorn/throw-new-error": "error",
    },
  },
  {
    files: ["apps/desktop/src/**/*.{ts,tsx}"],
    ignores: ["apps/desktop/src/**/*.test.tsx"],
    languageOptions: {
      globals: {
        AbortController: "readonly",
        URL: "readonly",
        clearTimeout: "readonly",
        document: "readonly",
        setTimeout: "readonly",
        window: "readonly",
      },
    },
    rules: {
      complexity: ["error", 10],
      "max-depth": ["error", 3],
      "max-lines": [
        "error",
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
      "max-lines-per-function": [
        "error",
        { max: 120, skipBlankLines: true, skipComments: true },
      ],
      "no-restricted-properties": "off",
    },
  },
  {
    files: ["apps/desktop/src/**/*.{test,spec}.tsx"],
    languageOptions: {
      globals: {
        document: "readonly",
      },
    },
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
      "vitest/expect-expect": "error",
    },
  },
  {
    files: ["src/**/*.test.ts", "test/**/*.test.ts"],
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
      "vitest/expect-expect": [
        "error",
        {
          assertFunctionNames: [
            "expect",
            "expectCapabilityMetadata",
            "expectDecodedFeatureExecution",
            "expectFeatureExecution",
            "expectFeatureHandles",
            "expectFeatureRejects",
          ],
        },
      ],
    },
  },
  {
    files: ["src/runtimes/**/*.ts"],
    rules: {
      "no-console": "off",
      "no-restricted-properties": "off",
    },
  },
  {
    files: ["*.config.js", "*.config.ts"],
    rules: {
      "no-restricted-properties": "off",
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts", "src/test-support/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: architectureImportPatterns.testSupport,
              message: "Production code must not import test-support helpers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/core/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: architectureImportPatterns.adapters,
              message: "Core must not import concrete adapters.",
            },
            {
              group: architectureImportPatterns.features,
              message: "Core must not import feature implementations.",
            },
            {
              group: architectureImportPatterns.runtimes,
              message: "Core must not import runtime composition code.",
            },
            {
              regex: "^(?:node:|@?[^./])",
              message:
                "Core must use injected ports instead of Node built-ins or packages.",
            },
            {
              group: architectureImportPatterns.testSupport,
              message: "Production code must not import test-support helpers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: architectureImportPatterns.adapters,
              message: "Features must not import concrete adapters.",
            },
            {
              group: architectureImportPatterns.core,
              message:
                "Features must not import assistant core implementation.",
            },
            {
              group: architectureImportPatterns.runtimes,
              message: "Features must not import runtime composition code.",
            },
            {
              regex: "^(?:node:|@?[^./])",
              message:
                "Features must use injected ports instead of Node built-ins or packages.",
            },
            {
              group: architectureImportPatterns.testSupport,
              message: "Production code must not import test-support helpers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/application/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                ...architectureImportPatterns.adapters,
                ...architectureImportPatterns.core,
                ...architectureImportPatterns.features,
                ...architectureImportPatterns.runtimes,
                ...architectureImportPatterns.testSupport,
              ],
              message:
                "Application policy must depend only on ports or application-local code.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/adapters/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: architectureImportPatterns.core,
              message:
                "Adapters must not import assistant core implementation.",
            },
            {
              group: architectureImportPatterns.features,
              message: "Adapters must not import feature implementations.",
            },
            {
              group: architectureImportPatterns.runtimes,
              message: "Adapters must not import runtime composition code.",
            },
            {
              group: architectureImportPatterns.testSupport,
              message: "Production code must not import test-support helpers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/ports/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                ...architectureImportPatterns.adapters,
                ...architectureImportPatterns.application,
                ...architectureImportPatterns.core,
                ...architectureImportPatterns.features,
                ...architectureImportPatterns.runtimes,
                ...architectureImportPatterns.testSupport,
              ],
              message: "Ports must not import implementation modules.",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
