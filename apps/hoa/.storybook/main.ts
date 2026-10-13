import type { StorybookConfig } from "@storybook/react-vite"

// Component stories (src/**/*.stories.tsx), built with a Vite config of their own (.storybook/vite.config.ts): the
// app's runs the Worker and TanStack Start, which a story doesn't need. Usage, from apps/hoa: pnpm storybook
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  framework: {
    name: "@storybook/react-vite",
    options: { builder: { viteConfigPath: ".storybook/vite.config.ts" } }
  },
  core: { disableTelemetry: true }
}

export default config
