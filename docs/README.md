# Documentation

Focused reference pages for this monorepo. Keep pages small and single-purpose, and update them in the same change as
what they describe.

## Where docs live

This folder is for engineering across the whole monorepo. Everything about one app or package lives in that app or
package's own `docs/` folder, next to its code. Start at its `docs/README.md`.

- [hoa: AI-native HOA management platform built on the governing documents](../apps/hoa/docs/README.md)

## Index

| Page                             | What it covers                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [tech-stack.md](tech-stack.md)   | The tools we reach for first, by category. Deviating requires a discussion with a human.                         |
| [conventions.md](conventions.md) | Quality gates, git hooks, tests, imports and file layout; links out to the pages below.                          |
| [react.md](react.md)             | React component conventions, the UI system and styling, and the state, error, URL, routing and form libraries.   |
| [typescript.md](typescript.md)   | TypeScript conventions and the type-helper libraries (`ts-extras`, `ts-pattern`, `tiny-invariant`, `zod`).                    |
| [hooks.md](hooks.md)             | React hook conventions and when to reach for `@mantine/hooks`.                                                   |
