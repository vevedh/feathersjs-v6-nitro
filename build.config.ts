import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/socket.io',
    'src/runtime/define',
    'src/runtime/diagnostics',
    'src/runtime/handler',
    'src/runtime/lifecycle',
    'src/runtime/path',
    'src/runtime/registry',
    'src/runtime/security',
    'src/runtime/sse',
    'src/runtime/types',
  ],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: false,
    esbuild: {
      target: 'node22',
    },
  },
  externals: ['feathers', 'feathers/errors', 'feathers/http', 'h3', 'nitropack', 'nitropack/runtime/plugin', 'socket.io'],
})
