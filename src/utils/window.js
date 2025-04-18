export function initWindowSize() {
  chrome.windows.getCurrent((window) => {
    const width = Math.round(window.width * 0.85)
    const height = Math.round(window.height * 0.85)
    document.body.style.width = width + "px"
    document.body.style.height = height + "px"
    document.body.style.minWidth = "800px"
    document.body.style.minHeight = "600px"
  })
}
