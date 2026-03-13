import neostandard from "neostandard";
import tseslint from "typescript-eslint";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**/*", "node_modules/**/*", "package-lock.json"]
  },
  ...neostandard({
    semi: true,
    ts: true
  }),
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },
    plugins: {
      prettier: prettierPlugin
    },
    rules: {
      "prettier/prettier": [
        "error",
        {
          semi: true,
          trailingComma: "none",
          singleQuote: false,
          printWidth: 120,
          endOfLine: "auto"
        }
      ],
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { args: "none" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-wrapper-object-types": "off"
    }
  },
  {
    files: ["types/**/*.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
      "import-x/export": "off",
      "import-x/no-duplicates": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off"
    }
  },
  prettierConfig
);
