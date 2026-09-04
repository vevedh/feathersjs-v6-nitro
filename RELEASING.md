# Releasing to npm

`@vevedh/feathersjs-v6-nitro` is published from GitHub Actions using npm Trusted Publishing (OIDC). Direct local publication is intentionally blocked by `prepublishOnly`.

## One-time npm configuration

On npmjs.com, open the package settings for `@vevedh/feathersjs-v6-nitro`, then configure **Trusted Publisher → GitHub Actions** with:

- Organization or user: `vevedh`
- Repository: `feathersjs-v6-nitro`
- Workflow filename: `release.yml`
- Environment name: `npm`
- Allowed action: enable direct `npm publish`

The workflow filename is only the file name, not `.github/workflows/release.yml`.

Patch 012-r4 validates publication with Node.js `24.15.0` and npm CLI `12.0.2`. npm 12 requires Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, so the release workflow intentionally uses the Node 24 LTS line even though the project itself remains compatible with Node 22.19.0.

The same Trusted Publisher relationship can be configured from a maintainer workstation running a compatible Node.js version:

```bash
npm install --global npm@12.0.2
npm trust github @vevedh/feathersjs-v6-nitro --repo vevedh/feathersjs-v6-nitro --file release.yml --env npm --allow-publish -y
```

The release workflow uses `actions/setup-node@v7`, Node.js `24.15.0` and npm CLI `12.0.2`; older setup-node releases exported a dummy `NODE_AUTH_TOKEN` (`XXXXX-XXXXX-XXXXX-XXXXX`) when `registry-url` was configured, which conflicts with the strict tokenless publish guard.

The repository and package are public, so npm Trusted Publishing automatically creates provenance attestations. The workflow therefore does not pass `--provenance` and does not use `NPM_TOKEN` or `NODE_AUTH_TOKEN`.

## GitHub environment

Create a GitHub environment named `npm`. Restrict deployments to the `main` branch. A required reviewer can be enabled if an additional manual approval is desired.

## Release procedure

1. Ensure the version in `package.json` is the intended prerelease version.
2. Run the full local gate:

   ```bash
   pnpm install --frozen-lockfile
   pnpm verify:release
   ```

3. Commit and push the release preparation to `main`.
4. In GitHub Actions, run **Publish npm** from the `main` branch.
5. Before installing dependencies, the workflow calls `node scripts/assert-version-unpublished.mjs`. A published npm version is immutable, so the workflow stops immediately if that exact version already exists.
6. The workflow repeats `pnpm verify:release`, then executes:

   ```bash
   npm publish --access public --tag next
   ```

7. Verify the registry state:

   ```bash
   npm view @vevedh/feathersjs-v6-nitro version
   npm view @vevedh/feathersjs-v6-nitro dist-tags
   ```

The `latest` dist-tag must not be used while Feathers v6 remains a prerelease dependency.

## Local publication

A local `npm publish` intentionally fails. This prevents an accidental token-based or unattested release from a developer workstation. Use the GitHub Actions release workflow instead.

The guard itself can be regression-tested on any platform with:

```bash
pnpm check:local-publish-guard
```

This command executes the real `prepublishOnly` guard in a child process with all GitHub/OIDC variables removed and succeeds only when that simulated local publication is rejected for the expected reason.


## Version immutability

An npm version cannot be overwritten. Patch 012 proved the Trusted Publishing path by reaching npm with a signed GitHub Actions provenance statement, but the registry rejected `0.1.0-alpha.9` because that version already existed. Patch 013 therefore promotes the unchanged runtime baseline to `0.1.0-alpha.10` and checks version availability before the expensive CI gate.
