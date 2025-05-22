const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/extension.ts'], // 入口文件
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  target: 'node18',
  external: ['vscode'], // vscode API 不应打进包
  sourcemap: true,      // 启用 Source Map 生成
  legalComments: 'inline', // 保留 sourceMappingURL 注释
}).catch(() => process.exit(1));
