# Apply Patch 011-r3

Overlay these files onto the current Patch 011-r2 working tree. Preserve the already regenerated `pnpm-lock.yaml`.

Then run:

```powershell
pnpm verify:release
```

If green, return the complete output plus the current `pnpm-lock.yaml` and `coverage/coverage-summary.json` for the final frozen Patch 011 archive.
