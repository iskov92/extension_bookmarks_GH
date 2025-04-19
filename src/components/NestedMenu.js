export class NestedMenu {
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
        console.log("isDarkTheme:", isDark)
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

  async render() {
    this.container.innerHTML = ""
    this.container.classList.add("nested-view")

    for (const bookmark of this.bookmarks) {
      const item = document.createElement("div")
      item.className = `bookmark-item ${
        bookmark.type === "folder" ? "folder" : "link"
      }`
      item.dataset.id = bookmark.id
      if (bookmark.url) {
        item.dataset.url = bookmark.url
      }

      const icon = document.createElement("img")
      icon.className = "bookmark-icon"

      // Если это папка, пробуем получить кастомную иконку или используем дефолтную по теме
      if (bookmark.type === "folder") {
        console.log("Это папка:", bookmark.title)
        const customIcon = await this.getCustomFolderIcon(bookmark.id)
        const defaultIcon = await this.getDefaultFolderIcon()
        console.log("Выбранная иконка:", customIcon || defaultIcon)
        icon.src = customIcon || defaultIcon

        // Добавляем обработчик ошибки загрузки изображения
        icon.onerror = () => {
          console.error("Ошибка загрузки иконки:", icon.src)
          // Пробуем использовать запасной вариант
          icon.src = "/assets/icons/folder.svg"
        }
      } else {
        icon.src = bookmark.favicon || "/assets/icons/default_favicon.png"
      }

      const title = document.createElement("span")
      title.className = "bookmark-title"
      title.textContent = bookmark.title

      item.appendChild(icon)
      item.appendChild(title)
      this.container.appendChild(item)
    }

    // Если нет закладок, показываем сообщение
    if (this.bookmarks.length === 0) {
      const empty = document.createElement("div")
      empty.className = "empty-message"
      empty.textContent = "Папка пуста"
      this.container.appendChild(empty)
    }
  }
}
