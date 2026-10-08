# Documentation

Focused reference pages for this monorepo. Keep pages **small and single-purpose**, and **update them in the same PR**
as the change they describe.

## Where docs live

This folder is for engineering across the whole monorepo. Everything about one app or package lives in that app or
package's own `docs/` folder, next to its code. Start at its `docs/README.md`.

- [hoa: DRC submission review app](../apps/hoa/docs/README.md)

## Index

| Page                             | What it covers                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [tech-stack.md](tech-stack.md)   | The preferred tools we reach for first (by category). Deviating requires a discussion with a human.                                                         |
| [conventions.md](conventions.md) | General conventions — quality gates, tests, imports, file/component layout; links out to the pages below.                                                   |
| [react.md](react.md)             | React component conventions, product-level UI-system selection and styling, and the state/error/URL/routing/form libraries.                                 |
| [typescript.md](typescript.md)   | TypeScript/type conventions **and** the type-helper libraries (`ts-extras`, `ts-pattern`, `tiny-invariant`, `zod`) — read before writing a new type helper. |
| [hooks.md](hooks.md)             | React hook conventions **and** the full `@mantine/hooks` catalog — read before writing a new hook.                                                          |
| [mcp-servers.md](mcp-servers.md) | The Langfuse and OpenRouter MCP servers for coding agents, their credentials, and OpenRouter Broadcast for cost tracking.                                    |
