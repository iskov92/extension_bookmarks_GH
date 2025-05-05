import { storage } from "../utils/storage.js"
import { iconStorage } from "../services/IconStorage.js"
import { ICONS } from "../config/constants.js"

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
    this.container.classList.add("nested-view")

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
        bookmark.type === "folder"
          ? "folder"
          : bookmark.type === "note"
          ? "note"
          : "link"
      }`
      item.dataset.id = bookmark.id
      item.dataset.type = bookmark.type

      // Делаем элемент перетаскиваемым
      item.setAttribute("draggable", "true")

      if (bookmark.url) {
        item.dataset.url = bookmark.url

        // Добавляем специальный обработчик для закладок
        console.log(
          "Добавляем обработчик клика на закладку (NestedMenu):",
          bookmark.title
        )
        item.addEventListener("click", (e) => {
          console.log(
            "Клик по закладке в NestedMenu:",
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
        item.dataset.content = bookmark.content || ""
        if (bookmark.createdAt) {
          item.dataset.createdAt = bookmark.createdAt
        }

        // Добавляем специальный обработчик для заметок прямо здесь
        console.log(
          "Добавляем обработчик клика на заметку (NestedMenu):",
          bookmark.title
        )
        item.addEventListener("click", (e) => {
          console.log("Клик по заметке в NestedMenu:", bookmark.title)

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
        // Для закладок используем фавикон с учетом настройки отображения
        try {
          // Получаем настройку отображения фавиконов
          const { getFaviconsEnabled } = await import("../utils/storage.js")
          const showFavicons = await getFaviconsEnabled()

          if (showFavicons && bookmark.favicon) {
            // Если включены фавиконы и у закладки есть сохраненный фавикон, используем его
            icon.src = bookmark.favicon

            // Обработчик ошибки загрузки фавикона
            icon.onerror = () => {
              icon.src = ICONS.LINK
            }
          } else if (showFavicons && bookmark.url) {
            // Если включены фавиконы, но у закладки нет сохраненного фавикона, пробуем загрузить его
            const getFaviconFunc =
              window.getFavicon ||
              (typeof getFavicon === "function" ? getFavicon : null)

            if (getFaviconFunc) {
              const faviconUrl = await getFaviconFunc(bookmark.url)
              if (faviconUrl && faviconUrl !== "/assets/icons/link.svg") {
                icon.src = faviconUrl

                // Обновляем закладку в хранилище, чтобы сохранить фавикон для будущего использования
                if (typeof updateBookmark === "function") {
                  updateBookmark(bookmark.id, {
                    ...bookmark,
                    favicon: faviconUrl,
                  }).catch((err) =>
                    console.error("Ошибка при обновлении фавикона:", err)
                  )
                }
              } else {
                icon.src = ICONS.LINK
              }
            } else {
              icon.src = ICONS.LINK
            }
          } else {
            // Если фавиконы отключены, используем стандартную иконку
            icon.src = ICONS.LINK
          }
        } catch (error) {
          console.error("Ошибка при определении настройки фавиконов:", error)
          icon.src = ICONS.LINK
        }

        // Обработчик ошибки загрузки фавикона
        icon.onerror = () => {
          icon.src = ICONS.LINK
        }
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
