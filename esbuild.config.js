const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/extension.js'], // 入口文件
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  target: 'node18',
  external: ['vscode'], // vscode API 不应打进包
}).catch(() => process.exit(1));
