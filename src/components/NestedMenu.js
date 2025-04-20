import { storage } from "../utils/storage.js"

export class NestedMenu {
  constructor(container, bookmarks) {
    this.container = container
    this.bookmarks = bookmarks
  }

  // Получить текущую тему
  async getCurrentTheme() {
    return new Promise((resolve) => {
      chrome.storage.sync.get("theme", (result) => {
        resolve(result.theme || "light")
      })
    })
  }

  // Получить дефолтную иконку папки в зависимости от темы
  async getDefaultFolderIcon() {
    const theme = await this.getCurrentTheme()
    return `/assets/icons/folder_${theme === "dark" ? "white" : "black"}.svg`
  }

  async getFolderIcon(folderId) {
    try {
      // Получаем кастомную иконку из локального хранилища
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(`folder_icon_${folderId}`, (result) => {
          resolve(result[`folder_icon_${folderId}`])
        })
      })

      if (result) {
        return result
      }
      return await this.getDefaultFolderIcon()
    } catch (error) {
      console.error("Error getting folder icon:", error)
      return await this.getDefaultFolderIcon()
    }
  }

  async render() {
    // Очищаем контейнер перед рендером
    this.container.innerHTML = ""
    this.container.classList.add("nested-view")

    console.log("NestedMenu render bookmarks:", this.bookmarks)

    // Проверяем, что у нас есть закладки для рендера
    if (!this.bookmarks || this.bookmarks.length === 0) {
      const empty = document.createElement("div")
      empty.className = "empty-message"
      empty.textContent = "Папка пуста"
      this.container.appendChild(empty)
      return
    }

    // Создаем Set для отслеживания уже отрендеренных ID
    const renderedIds = new Set()

    for (const bookmark of this.bookmarks) {
      // Пропускаем дубликаты
      if (renderedIds.has(bookmark.id)) {
        console.warn(
          `Дубликат найден в NestedMenu: ${bookmark.title} (${bookmark.id})`
        )
        continue
      }
      renderedIds.add(bookmark.id)

      const item = document.createElement("div")
      item.className = `bookmark-item ${
        bookmark.type === "folder" ? "folder" : "link"
      }`
      item.dataset.id = bookmark.id
      item.dataset.type = bookmark.type

      if (bookmark.url) {
        item.dataset.url = bookmark.url
      }

      const icon = document.createElement("img")
      icon.className = "bookmark-icon"

      if (bookmark.type === "folder") {
        icon.src = await this.getFolderIcon(bookmark.id)
        icon.onerror = async () => {
          icon.src = await this.getDefaultFolderIcon()
        }
      } else {
        icon.src = "/assets/icons/link.svg"
      }

      const title = document.createElement("span")
      title.className = "bookmark-title"
      title.textContent = bookmark.title

      item.appendChild(icon)
      item.appendChild(title)
      this.container.appendChild(item)
    }
  }

  destroy() {
    this.container.innerHTML = ""
    this.container.classList.remove("nested-view")
  }
}
