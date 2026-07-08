import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import renderer from 'vite-plugin-electron-renderer';

export default defineConfig(({ command }) => {
  const electronOutDir = command === 'serve' ? '.tmp/dev-electron' : 'dist-electron';

  return {
    plugins: [
      react(),
      electron({
        main: {
          entry: 'electron/main.ts',
          vite: {
            build: {
              sourcemap: true,
              minify: false,
              outDir: electronOutDir,
              emptyOutDir: false,
            },
          },
        },
        preload: {
          input: 'electron/preload.ts',
          vite: {
            build: {
              sourcemap: true,
              minify: false,
              outDir: electronOutDir,
              emptyOutDir: false,
            },
          },
        },
        renderer: {},
      }),
      renderer(),
    ],
    server: {
      hmr: {
        overlay: false,
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
