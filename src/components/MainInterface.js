export class MainInterface {
  constructor(container, bookmarks) {
    this.container = container
    this.bookmarks = bookmarks || []
  }

  render() {
    this.container.innerHTML = ""
    this.container.className = "main-content"

    if (!Array.isArray(this.bookmarks) || this.bookmarks.length === 0) {
      this.container.innerHTML = `
        <div class="empty-message">
          Нет закладок. Добавьте новую закладку или папку.
        </div>
      `
      return
    }

    this.bookmarks.forEach((bookmark) => {
      const item = document.createElement("div")
      item.className = `bookmark-item ${
        bookmark.type === "folder" ? "folder" : ""
      }`
      item.dataset.id = bookmark.id
      if (bookmark.url) {
        item.dataset.url = bookmark.url
      }

      const icon = document.createElement("img")
      icon.className = "bookmark-icon"
      icon.src =
        bookmark.type === "folder"
          ? "assets/icons/folder.svg"
          : bookmark.favicon || "assets/icons/default_favicon.png"
      icon.alt = ""

      const title = document.createElement("div")
      title.className = "bookmark-title"
      title.textContent = bookmark.title

      item.appendChild(icon)
      item.appendChild(title)
      this.container.appendChild(item)
    })
  }
}
