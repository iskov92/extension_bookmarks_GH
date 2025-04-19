export class MainInterface {
  constructor(container, bookmarks) {
    this.container = container
    this.bookmarks = bookmarks || []
  }

  // Получить кастомную иконку папки из хранилища
  async getCustomFolderIcon(folderId) {
    try {
      return await new Promise((resolve) => {
        chrome.storage.local.get(`folder_icon_${folderId}`, (result) => {
          resolve(result[`folder_icon_${folderId}`])
        })
      })
    } catch (error) {
      console.error("Ошибка при получении иконки папки:", error)
      return null
    }
  }

  async render() {
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

    for (const bookmark of this.bookmarks) {
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

      // Если это папка, пробуем получить кастомную иконку
      if (bookmark.type === "folder") {
        const customIcon = await this.getCustomFolderIcon(bookmark.id)
        icon.src = customIcon || "/src/assets/icons/folder.svg"
      } else {
        icon.src = bookmark.favicon || "/src/assets/icons/default_favicon.png"
      }

      icon.alt = ""

      const title = document.createElement("div")
      title.className = "bookmark-title"
      title.textContent = bookmark.title

      item.appendChild(icon)
      item.appendChild(title)
      this.container.appendChild(item)
    }
  }
}
