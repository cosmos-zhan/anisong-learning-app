import tseslint from 'typescript-eslint';
export default tseslint.config({ignores:['dist/**','apps/android/**']},...tseslint.configs.recommended,{rules:{'@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_'}]}});
