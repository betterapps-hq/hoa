# HOA monorepo

A Turborepo and pnpm monorepo for HOA design-review applications and shared packages.

## What's inside?

This Turborepo includes the following packages and apps:

### Apps and Packages

- [hoa](apps/hoa/README.md): TanStack Start web app that reviews Design Review Committee (DRC) submissions with AI
- `@repo/oxlint-config`: shared [oxlint](https://oxc.rs) configuration
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Applications and shared packages use [TypeScript](https://www.typescriptlang.org/).

### Install dependencies

```sh
pnpm install
```

Then follow the [hoa setup guide](apps/hoa/docs/setup.md) to add OpenRouter and Langfuse credentials.

### Develop

```sh
pnpm dev
```

### Verify

```sh
pnpm verify
```

Runs formatting, lint, type-checking, unused-code analysis (knip) and unit tests with coverage. It must be clean before
work is considered done.

### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [oxlint](https://oxc.rs) for code linting
- [oxfmt](https://oxc.rs) for code formatting
- [Vitest](https://vitest.dev) for testing
- [Lefthook](https://lefthook.dev) for Git hooks
