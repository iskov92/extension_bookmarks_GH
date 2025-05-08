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
        // Для закладок используем фавикон с учетом настройки отображения
        try {
          // Получаем настройку отображения фавиконов
          let showFavicons = true // По умолчанию показываем фавиконы

          try {
            const { getFaviconsEnabled } = await import("../utils/storage.js")
            if (typeof getFaviconsEnabled === "function") {
              showFavicons = await getFaviconsEnabled()
            }
          } catch (settingsError) {
            console.warn(
              "Не удалось получить настройку отображения фавиконов, используем значение по умолчанию:",
              settingsError
            )
          }

          if (showFavicons && bookmark.favicon) {
            // Если включены фавиконы и у закладки есть сохраненный фавикон, используем его
            try {
              // Предварительно проверяем, что URL фавикона корректен
              new URL(bookmark.favicon)

              // Устанавливаем обработчик ошибки до установки src
              icon.onerror = () => {
                // При ошибке загрузки удаляем свойство favicon у закладки в следующем обновлении
                if (typeof updateBookmark === "function") {
                  try {
                    // Делаем копию без свойства favicon
                    const { favicon, ...bookmarkWithoutFavicon } = bookmark
                    updateBookmark(bookmark.id, bookmarkWithoutFavicon).catch(
                      (err) =>
                        console.warn(
                          "Не удалось обновить закладку после ошибки фавикона:",
                          err
                        )
                    )
                  } catch (error) {
                    console.warn("Ошибка при обновлении закладки:", error)
                  }
                }

                // Устанавливаем стандартную иконку
                icon.src = "/assets/icons/link.svg"
              }

              // После установки обработчика ошибки устанавливаем src
              icon.src = bookmark.favicon
            } catch (urlError) {
              console.warn(
                `Некорректный URL фавикона: ${bookmark.favicon}`,
                urlError
              )
              icon.src = "/assets/icons/link.svg"

              // Удаляем некорректный фавикон из закладки
              if (typeof updateBookmark === "function") {
                try {
                  const { favicon, ...bookmarkWithoutFavicon } = bookmark
                  updateBookmark(bookmark.id, bookmarkWithoutFavicon).catch(
                    (err) =>
                      console.warn(
                        "Не удалось удалить некорректный фавикон:",
                        err
                      )
                  )
                } catch (error) {
                  console.warn("Ошибка при обновлении закладки:", error)
                }
              }
            }
          } else if (showFavicons && bookmark.url) {
            // Если включены фавиконы, но у закладки нет сохраненного фавикона, пробуем загрузить его
            let getFaviconFunc = null

            try {
              // Проверяем в разных местах
              if (
                window.getFavicon &&
                typeof window.getFavicon === "function"
              ) {
                getFaviconFunc = window.getFavicon
              } else if (typeof getFavicon === "function") {
                getFaviconFunc = getFavicon
              } else {
                // Импортируем функцию из storage.js
                const { getFaviconFast } = await import("../utils/storage.js")
                if (typeof getFaviconFast === "function") {
                  getFaviconFunc = getFaviconFast
                }
              }
            } catch (importError) {
              console.warn(
                "Не удалось импортировать функцию getFaviconFast:",
                importError
              )
            }

            if (getFaviconFunc) {
              try {
                const faviconUrl = await getFaviconFunc(bookmark.url)
                if (faviconUrl && faviconUrl !== "/assets/icons/link.svg") {
                  icon.src = faviconUrl

                  // Обработчик ошибки загрузки фавикона
                  icon.onerror = () => {
                    console.warn(`Не удалось загрузить фавикон: ${faviconUrl}`)
                    icon.src = "/assets/icons/link.svg"
                  }

                  // Обновляем закладку в хранилище, чтобы сохранить фавикон для будущего использования
                  try {
                    if (typeof updateBookmark === "function") {
                      updateBookmark(bookmark.id, {
                        ...bookmark,
                        favicon: faviconUrl,
                      }).catch((err) =>
                        console.error("Ошибка при обновлении фавикона:", err)
                      )
                    }
                  } catch (updateError) {
                    console.warn(
                      "Ошибка при обновлении фавикона в хранилище:",
                      updateError
                    )
                  }
                } else {
                  icon.src = "/assets/icons/link.svg"
                }
              } catch (faviconError) {
                console.warn("Ошибка при получении фавикона:", faviconError)
                icon.src = "/assets/icons/link.svg"
              }
            } else {
              // Если функция getFavicon недоступна, используем Google Favicon API напрямую
              try {
                const domain = new URL(bookmark.url).hostname
                icon.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
                  domain
                )}&sz=64`

                // Обработчик ошибки загрузки фавикона
                icon.onerror = () => {
                  icon.src = "/assets/icons/link.svg"
                }
              } catch (urlError) {
                console.warn("Ошибка при обработке URL:", urlError)
                icon.src = "/assets/icons/link.svg"
              }
            }
          } else {
            // Если фавиконы отключены, используем стандартную иконку
            icon.src = "/assets/icons/link.svg"
          }
        } catch (error) {
          console.error("Ошибка при определении настройки фавиконов:", error)
          icon.src = "/assets/icons/link.svg"
        }

        // Обработчик ошибки загрузки фавикона
        if (!icon.onerror) {
          icon.onerror = () => {
            icon.src = "/assets/icons/link.svg"
          }
        }
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
