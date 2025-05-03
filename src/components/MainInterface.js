import { storage } from "../utils/storage.js"
import { iconStorage } from "../services/IconStorage.js"
import { ICONS } from "../config/constants.js"

export class MainInterface {
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

  // Получить кастомную иконку папки из хранилища
  async getCustomFolderIcon(folderId) {
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(`folder_icon_${folderId}`, (result) => {
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
    // Проверяем текущую тему по атрибуту data-theme на body
    const theme = document.body.getAttribute("data-theme") || "light"
    return `/assets/icons/folder_${theme === "dark" ? "black" : "white"}.svg`
  }

  // Получить иконку заметки в зависимости от темы
  async getNoteIcon() {
    // Проверяем текущую тему по атрибуту data-theme на body
    const theme = document.body.getAttribute("data-theme") || "light"
    return theme === "dark" ? ICONS.NOTE.DARK : ICONS.NOTE.LIGHT
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
    this.container.classList.add("main-view")

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
        bookmark.type === "folder"
          ? "folder"
          : bookmark.type === "note"
          ? "note"
          : ""
      }`
      bookmarkElement.dataset.id = bookmark.id
      bookmarkElement.dataset.type = bookmark.type

      // Делаем элемент перетаскиваемым
      bookmarkElement.setAttribute("draggable", "true")

      if (bookmark.url) {
        bookmarkElement.dataset.url = bookmark.url

        // Добавляем специальный обработчик для закладок
        console.log("Добавляем обработчик клика на закладку:", bookmark.title)
        bookmarkElement.addEventListener("click", (e) => {
          console.log(
            "Клик по закладке в MainInterface:",
            bookmark.title,
            "URL:",
            bookmark.url
          )

          // Предотвращаем дальнейшую обработку события
          e.stopPropagation()

          // Открываем URL в новой вкладке
          if (bookmark.url) {
            chrome.tabs.create({ url: bookmark.url })
          }
        })
      }

      // Для заметок сохраняем содержимое и дату создания
      if (bookmark.type === "note") {
        bookmarkElement.dataset.content = bookmark.content || ""
        if (bookmark.createdAt) {
          bookmarkElement.dataset.createdAt = bookmark.createdAt
        }

        // Добавляем специальный обработчик для заметок прямо здесь
        console.log("Добавляем обработчик клика на заметку:", bookmark.title)
        bookmarkElement.addEventListener("click", (e) => {
          console.log("Клик по заметке в MainInterface:", bookmark.title)

          // Предотвращаем дальнейшую обработку события, чтобы исключить конфликты
          e.stopPropagation()

          // Вызываем функцию отображения диалога редактирования
          if (typeof showNoteEditDialog === "function") {
            showNoteEditDialog({
              id: bookmark.id,
              title: bookmark.title,
              content: bookmark.content || "",
              createdAt: bookmark.createdAt,
            })
          } else {
            console.error("Функция showNoteEditDialog не определена")
          }
        })
      }

      const icon = document.createElement("img")
      icon.className = "bookmark-icon"
      icon.alt = bookmark.type

      if (bookmark.type === "folder") {
        icon.src = await this.getFolderIcon(bookmark.id)
        icon.onerror = async () => {
          icon.src = await this.getDefaultFolderIcon()
        }
      } else if (bookmark.type === "note") {
        // Для заметок используем иконку заметки
        icon.src = await this.getNoteIcon()
      } else {
        // Для закладок используем иконку ссылки
        icon.src = ICONS.LINK
      }

      const title = document.createElement("span")
      title.className = "bookmark-title"
      title.textContent = bookmark.title

      bookmarkElement.appendChild(icon)
      bookmarkElement.appendChild(title)
      this.container.appendChild(bookmarkElement)
    }

    // Вызываем функцию обновления обработчиков перетаскивания в родительском компоненте
    if (typeof updateDragHandlers === "function") {
      updateDragHandlers()
    }
  }
}
