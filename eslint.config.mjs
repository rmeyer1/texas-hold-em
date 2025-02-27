import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Ignore patterns (replacing .eslintignore)
  {
    ignores: [
      // Build output
      ".next/**",
      "out/**",
      
      // Node modules
      "node_modules/**",
      
      // Test coverage
      "coverage/**",
      
      // Misc
      "**/*.pem",
      
      // Debug
      "npm-debug.log*",
      "yarn-debug.log*",
      "yarn-error.log*",
      
      // Local env files
      ".env*.local",
      
      // Vercel
      ".vercel/**",
      
      // TypeScript
      "*.tsbuildinfo",
      "next-env.d.ts"
    ]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      // Fix unescaped entities in JSX
      "react/no-unescaped-entities": "off",
      
      // Handle unused variables
      "@typescript-eslint/no-unused-vars": ["error", { 
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "ignoreRestSiblings": true 
      }],
      
      // Handle missing dependencies in hooks
      "react-hooks/exhaustive-deps": "warn",
      
      // Handle empty interfaces - simplified configuration
      "@typescript-eslint/no-empty-object-type": "off",
      
      // Handle explicit any
      "@typescript-eslint/no-explicit-any": "warn",
      
      // Handle ts-ignore comments
      "@typescript-eslint/ban-ts-comment": ["error", {
        "ts-expect-error": "allow-with-description",
        "ts-ignore": false,
        "ts-nocheck": false,
        "ts-check": false,
        "minimumDescriptionLength": 3
      }],
      
      // Handle const assertions
      "@typescript-eslint/prefer-as-const": "error"
    }
  }
];

export default eslintConfig;
