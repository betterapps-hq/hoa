import { MonitorIcon, MoonIcon, SunIcon, SunMoonIcon } from "lucide-react"
import { useTheme } from "next-themes"
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@/components/ui/dropdown-menu"

const themes = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon }
] as const

/** The theme picker in a dropdown menu: light, dark, or the device's setting, which is the default. */
export function ThemeSubmenu() {
  const { theme = "system", setTheme } = useTheme()
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <SunMoonIcon />
        Theme
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setTheme(value)
            }
          }}
        >
          {themes.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
