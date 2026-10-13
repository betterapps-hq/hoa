import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { fenceReview } from "@/tests/fenceReview"
import { EvidenceList } from "./EvidenceList"

function setup() {
  const { files } = fenceReview()
  const loadImage = vi.fn<(fileId: string) => Promise<string>>(async () => "data:image/png;base64,AA==")
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EvidenceList
        evidence={[
          { fileId: "file-form", page: 2, quote: "Owner signature", region: null },
          { fileId: "file-appendix", page: 1, quote: "Trex fence", region: null },
          { fileId: "file-photo", page: 1, quote: null, region: null }
        ]}
        context={{ files, loadImage, fileUrl: (fileId) => `/files/applications/app/${fileId}` }}
      />
    </QueryClientProvider>
  )
  return userEvent.setup()
}

describe("EvidenceList", () => {
  it("opens a document the browser shows at the page it was read from", () => {
    setup()
    expect(screen.getByRole("link", { name: "application-form.pdf, page 2" })).toHaveAttribute(
      "href",
      "/files/applications/app/file-form#page=2"
    )
    expect(screen.getByRole("link", { name: "application-form.pdf, page 2" })).toHaveAttribute("target", "_blank")
    expect(screen.queryByRole("link", { name: /appendix\.docx/ })).not.toBeInTheDocument()
    expect(screen.getByText("appendix.docx")).toBeInTheDocument()
  })

  it("opens a photo at full size from its thumbnail", async () => {
    const user = setup()
    await user.click(await screen.findByRole("button", { name: "View new-fence.jpg" }))
    expect(await screen.findByRole("dialog", { name: "new-fence.jpg" })).toBeInTheDocument()
  })
})
