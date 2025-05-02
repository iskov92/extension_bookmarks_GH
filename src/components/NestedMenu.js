import { storage } from "../utils/storage.js"
import { iconStorage } from "../services/IconStorage.js"

export class NestedMenu {
  constructor(container, bookmarks) {
    this.container = container
    this.bookmarks = bookmarks
  }

  // Получить текущую тему
  async getCurrentTheme() {
    return new Promise((resolve) => {
      chrome.storage.local.get("theme", (result) => {
        resolve(result.theme || "light")
      })
    })
  }

  // Получить дефолтную иконку папки в зависимости от темы
  async getDefaultFolderIcon() {
    // Проверяем текущую тему по атрибуту data-theme на body
    const theme = document.body.getAttribute("data-theme") || "light"
    return `/assets/icons/folder_${theme === "dark" ? "black" : "white"}.svg`
  }

  async getFolderIcon(folderId) {
    try {
      const iconBlob = await iconStorage.getIcon(folderId)
      if (iconBlob) {
        return URL.createObjectURL(iconBlob)
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

      // Делаем элемент перетаскиваемым
      item.setAttribute("draggable", "true")

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

    // Вызываем функцию обновления обработчиков перетаскивания в родительском компоненте
    if (typeof updateDragHandlers === "function") {
      updateDragHandlers()
    }
  }

  destroy() {
    this.container.innerHTML = ""
    this.container.classList.remove("nested-view")
  }
}
