// Copies the part of the image currently visible inside `container` (after zoom / pan) to
// the clipboard as a PNG. Shared by the order review modal and the base template review
// modal (S key / camera button). `onCopied` runs once the clipboard write succeeded.
export function copyVisibleImageToClipboard(container: HTMLElement, onCopied: () => void): void {
  try {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const containerRect = container.getBoundingClientRect()

    // Find the image element (skipping the loading placeholder LazyImage may still show)
    const imgElement = container.querySelector<HTMLImageElement>("img:not([alt='Loading...'])")
    if (!imgElement) return

    // Get the actual rendered image dimensions and position
    const imgRect = imgElement.getBoundingClientRect()

    const visibleLeft = Math.max(containerRect.left, imgRect.left)
    const visibleTop = Math.max(containerRect.top, imgRect.top)
    const visibleRight = Math.min(containerRect.right, imgRect.right)
    const visibleBottom = Math.min(containerRect.bottom, imgRect.bottom)

    const visibleWidth = Math.max(0, visibleRight - visibleLeft)
    const visibleHeight = Math.max(0, visibleBottom - visibleTop)

    // Set canvas size to match only the visible area
    canvas.width = visibleWidth
    canvas.height = visibleHeight

    // Create a new image to draw on canvas
    const img = new Image()
    // Drive images come through our own origin now, so requesting CORS would only
    // force a second download into a different cache partition.
    if (new URL(imgElement.src, window.location.href).origin !== window.location.origin) {
      img.crossOrigin = "anonymous"
    }

    img.onerror = () => console.error("Failed to load image for screenshot")

    img.onload = () => {
      const scaleX = img.naturalWidth / imgRect.width
      const scaleY = img.naturalHeight / imgRect.height

      const sourceX = (visibleLeft - imgRect.left) * scaleX
      const sourceY = (visibleTop - imgRect.top) * scaleY
      const sourceWidth = visibleWidth * scaleX
      const sourceHeight = visibleHeight * scaleY

      // Draw only the visible portion of the image
      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight, // Source rectangle
        0,
        0,
        visibleWidth,
        visibleHeight, // Destination rectangle
      )

      // Convert canvas to blob and copy to clipboard
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
            onCopied()
          } catch (error) {
            console.error("Failed to copy screenshot to clipboard:", error)
          }
        }
      }, "image/png")
    }

    img.src = imgElement.src
  } catch (error) {
    console.error("Failed to take screenshot:", error)
  }
}
