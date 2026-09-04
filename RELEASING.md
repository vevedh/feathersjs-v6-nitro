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

With npm CLI 11.19.0, the same relationship can be configured from a maintainer workstation:

```bash
npm install --global npm@11.19.0
npm trust github @vevedh/feathersjs-v6-nitro --repo vevedh/feathersjs-v6-nitro --file release.yml --env npm --allow-publish -y
```

The release workflow uses `actions/setup-node@v7`; older setup-node releases exported a dummy `NODE_AUTH_TOKEN` (`XXXXX-XXXXX-XXXXX-XXXXX`) when `registry-url` was configured, which conflicts with the strict tokenless publish guard.

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
5. The workflow repeats `pnpm verify:release`, then executes:

   ```bash
   npm publish --access public --tag next
   ```

6. Verify the registry state:

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
