import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { ImageViewer } from "./ImageViewer"

const src = "data:image/png;base64,AA=="

describe("ImageViewer", () => {
  it("opens the photo at full size from its thumbnail, named by its file", async () => {
    const user = userEvent.setup()
    render(<ImageViewer src={src} name="new-fence.jpg" trigger={<img src={src} alt="" />} />)
    await user.click(screen.getByRole("button", { name: "View new-fence.jpg" }))
    const viewer = await screen.findByRole("dialog", { name: "new-fence.jpg" })
    expect(within(viewer).getByRole("img", { name: "new-fence.jpg" })).toHaveAttribute("src", src)
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("holds the photo's place while it loads", () => {
    render(<ImageViewer src={undefined} name="new-fence.jpg" open />)
    expect(within(screen.getByRole("dialog", { name: "new-fence.jpg" })).queryByRole("img")).not.toBeInTheDocument()
  })
})
