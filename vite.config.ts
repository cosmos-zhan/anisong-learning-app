import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:'./',test:{include:['tests/**/*.test.{ts,tsx}'],environment:'jsdom',setupFiles:['tests/setup.ts'],restoreMocks:true},build:{outDir:'dist'}});
