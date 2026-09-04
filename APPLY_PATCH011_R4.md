# Patch 011 r4 - source/test tree repair

Apply this archive at the project root by merging/replacing files. It contains the complete `src/` and `test/` trees, with the r3 ESLint fixes already integrated.

It does **not** contain `package.json`, `pnpm-lock.yaml`, `node_modules`, `.nuxt`, `.output`, `dist`, or `coverage`.

After extraction run:

```powershell
pnpm typecheck
pnpm lint
pnpm test:coverage
pnpm verify:release
```

Do not rerun `bootstrap:patch011:windows` unless dependencies or the lockfile change.
