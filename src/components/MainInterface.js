import { storage } from "../utils/storage.js"

export class MainInterface {
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

  // Получить кастомную иконку папки из хранилища
  async getCustomFolderIcon(folderId) {
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(`folder_icon_${folderId}`, (result) => {
          console.log(
            "Кастомная иконка для папки",
            folderId,
            ":",
            result[`folder_icon_${folderId}`]
          )
          resolve(result[`folder_icon_${folderId}`])
        })
      })
      return result
    } catch (error) {
      console.error("Ошибка при получении иконки папки:", error)
      return null
    }
  }

  // Получить дефолтную иконку папки в зависимости от темы
  async getDefaultFolderIcon() {
    const theme = await this.getCurrentTheme()
    return `/assets/icons/folder_${theme === "dark" ? "white" : "black"}.svg`
  }

  async getFolderIcon(folderId) {
    try {
      const customIcon = await storage.get(`folder_icon_${folderId}`)
      if (customIcon) {
        return customIcon
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
    this.container.classList.add("main-view")

    console.log("MainInterface render bookmarks:", this.bookmarks)

    // Проверяем, что у нас есть закладки для рендера
    if (!this.bookmarks || this.bookmarks.length === 0) {
      const empty = document.createElement("div")
      empty.className = "empty-message"
      empty.textContent = "Нет закладок"
      this.container.appendChild(empty)
      return
    }

    // Создаем Set для отслеживания уже отрендеренных ID
    const renderedIds = new Set()

    for (const bookmark of this.bookmarks) {
      // Пропускаем дубликаты
      if (renderedIds.has(bookmark.id)) {
        console.warn(
          `Дубликат найден в MainInterface: ${bookmark.title} (${bookmark.id})`
        )
        continue
      }
      renderedIds.add(bookmark.id)

      const bookmarkElement = document.createElement("div")
      bookmarkElement.className = `bookmark-item ${
        bookmark.type === "folder" ? "folder" : ""
      }`
      bookmarkElement.dataset.id = bookmark.id

      if (bookmark.url) {
        bookmarkElement.dataset.url = bookmark.url
      }

      const icon = document.createElement("img")
      icon.className = "bookmark-icon"
      icon.alt = bookmark.type

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

      bookmarkElement.appendChild(icon)
      bookmarkElement.appendChild(title)
      this.container.appendChild(bookmarkElement)
    }
  }
}
