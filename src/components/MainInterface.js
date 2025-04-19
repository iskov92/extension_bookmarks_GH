import { storage } from "../utils/storage.js"

export class MainInterface {
  constructor(container, bookmarks) {
    this.container = container
    this.bookmarks = bookmarks

    // Подписываемся на изменение темы
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "sync" && changes.isDarkTheme) {
        this.render() // Перерисовываем интерфейс при смене темы
      }
    })
  }

  // Получить текущую тему
  async getCurrentTheme() {
    return new Promise((resolve) => {
      chrome.storage.sync.get("isDarkTheme", (result) => {
        const isDark = result.isDarkTheme ?? true // true = темная тема по умолчанию
        resolve(isDark ? "dark" : "light")
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
    // Для темной темы - черную иконку, для светлой - белую
    const iconPath = `/assets/icons/folder_${
      theme === "dark" ? "black" : "white"
    }.svg`
    console.log("Текущая тема:", theme)
    console.log("Путь к дефолтной иконке:", iconPath)
    return iconPath
  }

  async getFolderIcon(folderId) {
    try {
      // Сначала пробуем получить кастомную иконку
      const customIcon = await storage.get(`folder_icon_${folderId}`)
      if (customIcon) {
        return customIcon
      }

      // Если кастомной иконки нет, возвращаем дефолтную в зависимости от темы
      const theme = await this.getCurrentTheme()
      return `/assets/icons/folder_${theme === "dark" ? "black" : "white"}.svg`
    } catch (error) {
      console.error("Error getting folder icon:", error)
      const theme = await this.getCurrentTheme()
      return `/assets/icons/folder_${theme === "dark" ? "black" : "white"}.svg`
    }
  }

  async render() {
    this.container.innerHTML = ""

    if (!this.bookmarks || this.bookmarks.length === 0) {
      this.container.innerHTML = `
        <div class="empty-message">
          Нет закладок. Нажмите "+" чтобы добавить.
        </div>
      `
      return
    }

    for (const bookmark of this.bookmarks) {
      const bookmarkElement = document.createElement("div")
      bookmarkElement.className = `bookmark-item ${
        bookmark.type === "folder" ? "folder" : ""
      }`
      bookmarkElement.dataset.id = bookmark.id

      if (bookmark.url) {
        bookmarkElement.dataset.url = bookmark.url
      }

      const iconSrc =
        bookmark.type === "folder"
          ? await this.getFolderIcon(bookmark.id)
          : bookmark.favicon || "/assets/icons/link.svg"

      bookmarkElement.innerHTML = `
        <img src="${iconSrc}" alt="${bookmark.type}" class="bookmark-icon" />
        <span class="bookmark-title">${bookmark.title}</span>
      `

      this.container.appendChild(bookmarkElement)
    }
  }
}
