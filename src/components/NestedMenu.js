export class NestedMenu {
  constructor(container, bookmarks) {
    this.container = container
    this.bookmarks = bookmarks
  }

  render() {
    this.container.innerHTML = ""

    this.bookmarks.forEach((bookmark) => {
      const item = document.createElement("div")
      item.className = "bookmark-item" + (!bookmark.url ? " folder" : " link")
      item.dataset.id = bookmark.id
      if (bookmark.url) item.dataset.url = bookmark.url

      const icon = document.createElement("img")
      icon.className = "bookmark-icon"
      icon.src = bookmark.url
        ? `chrome://favicon/${bookmark.url}`
        : "./assets/icons/folder.png"
      icon.width = 24
      icon.height = 24

      const title = document.createElement("span")
      title.className = "bookmark-title"
      title.textContent = bookmark.title

      item.appendChild(icon)
      item.appendChild(title)
      this.container.appendChild(item)
    })

    // Если нет закладок, показываем сообщение
    if (this.bookmarks.length === 0) {
      const empty = document.createElement("div")
      empty.className = "empty-message"
      empty.textContent = "Папка пуста"
      this.container.appendChild(empty)
    }
  }
}

