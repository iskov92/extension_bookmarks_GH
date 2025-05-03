// Класс для работы с хранилищем
export class Storage {
  constructor() {
    this.storageKey = "gh_bookmarks"
    this.initializeStorage()
  }

  async initializeStorage() {
    const bookmarks = await this.get(this.storageKey)
    if (!bookmarks) {
      // Создаем начальную структуру с базовыми папками
      const initialBookmarks = [
        {
          id: "favorites",
          title: "Избранное",
          type: "folder",
          children: [],
        },
        {
          id: "work",
          title: "Работа",
          type: "folder",
          children: [],
        },
        {
          id: "personal",
          title: "Личное",
          type: "folder",
          children: [],
        },
      ]
      await this.set(this.storageKey, initialBookmarks)
    }
  }

  async get(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        console.log(`Storage.get для ключа ${key}:`, result)
        const value =
          result && typeof result === "object" ? result[key] : undefined
        resolve(value)
      })
    })
  }

  async set(key, value) {
    return new Promise((resolve, reject) => {
      try {
        console.log(`Storage.set для ключа ${key}:`, value)
        const data = { [key]: value }
        chrome.storage.local.set(data, () => {
          if (chrome.runtime.lastError) {
            console.error(
              `Ошибка при сохранении ${key}:`,
              chrome.runtime.lastError
            )
            reject(chrome.runtime.lastError)
          } else {
            console.log(`Успешно сохранено ${key}:`, value)
            resolve()
          }
        })
      } catch (error) {
        console.error(`Исключение при сохранении ${key}:`, error)
        reject(error)
      }
    })
  }
}

// Экспортируем экземпляр класса
export const storage = new Storage()

// Получить все закладки из хранилища
export async function getStoredBookmarks() {
  const bookmarks = await storage.get("gh_bookmarks")
  return Array.isArray(bookmarks) ? bookmarks : []
}

// Создать новую закладку в хранилище
export async function createStoredBookmark(parentId, title, url = "") {
  console.log(
    `Запрос на создание элемента: ${title} в родительской папке: ${parentId}`
  )

  try {
    // Проверки входных данных
    if (!parentId) {
      console.error("Ошибка: parentId не может быть пустым")
      return null
    }

    if (!title || title.trim() === "") {
      console.error("Ошибка: title не может быть пустым")
      return null
    }

    const bookmarks = await getStoredBookmarks()
    console.log(
      `Получены закладки из хранилища, количество: ${bookmarks.length}`
    )

    // Если есть URL, проверяем и добавляем протокол если нужно
    if (url) {
      // Убираем пробелы в начале и конце
      url = url.trim()

      // Проверяем наличие протокола
      if (!url.match(/^https?:\/\//i)) {
        // Если нет протокола, добавляем https://
        url = `https://${url}`
      }
    }

    const newBookmark = {
      id: generateUniqueId(),
      title: title.trim(),
      type: url ? "bookmark" : "folder",
      children: [],
    }

    console.log(`Создан новый элемент: ${JSON.stringify(newBookmark)}`)

    if (url) {
      newBookmark.url = url
      // Получаем favicon через новую функцию
      try {
        console.log(`Загрузка фавикона для ${url}...`)
        newBookmark.favicon = await getFavicon(url)
        console.log(`Получен фавикон: ${newBookmark.favicon}`)

        // Если получен стандартный фавикон, пробуем еще через Google
        if (newBookmark.favicon === "/assets/icons/link.svg") {
          try {
            const urlObj = new URL(url)
            const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
              urlObj.hostname
            )}&sz=32`
            console.log(
              `Дополнительная попытка через Google: ${googleFaviconUrl}`
            )
            newBookmark.favicon = googleFaviconUrl
          } catch (e) {
            console.warn("Не удалось получить фавикон через Google:", e)
          }
        }
      } catch (error) {
        console.error("Ошибка при получении favicon:", error)
        newBookmark.favicon = "/assets/icons/link.svg"
      }
    }

    let added = false

    if (parentId === "0") {
      // Добавляем в корневую папку
      bookmarks.push(newBookmark)
      added = true
      console.log(`Элемент добавлен в корневую папку`)
    } else {
      // Проверка существования родительской папки
      const folderExists = findFolderById(bookmarks, parentId) !== null

      if (!folderExists) {
        console.error(`Родительская папка с ID ${parentId} не существует!`)

        // Логируем все папки для отладки
        const allFolders = []
        function collectFolders(items) {
          for (const item of items) {
            if (item.type === "folder") {
              allFolders.push({ id: item.id, title: item.title })
              if (item.children && item.children.length > 0) {
                collectFolders(item.children)
              }
            }
          }
        }
        collectFolders(bookmarks)
        console.log(`Доступные папки:`, allFolders)

        // Добавляем в корневую папку вместо отсутствующей
        bookmarks.push(newBookmark)
        added = true
        console.log(
          `Элемент добавлен в корневую папку вместо отсутствующей родительской папки`
        )
      } else {
        // Добавляем элемент в найденную родительскую папку
        function addToFolder(items) {
          for (const item of items) {
            if (item.id === parentId) {
              // Убедимся, что у папки есть свойство children
              if (!item.children) {
                item.children = []
                console.log(
                  `Инициализировано свойство children для папки ${item.title} (ID: ${item.id})`
                )
              }

              item.children.push(newBookmark)
              console.log(
                `Элемент добавлен в папку ${item.title} (ID: ${item.id})`
              )
              return true
            }

            if (item.type === "folder" && Array.isArray(item.children)) {
              if (addToFolder(item.children)) {
                return true
              }
            }
          }
          return false
        }

        added = addToFolder(bookmarks)

        if (!added) {
          console.warn(
            `Не удалось найти родительскую папку с ID: ${parentId} для добавления элемента`
          )

          // Последняя попытка найти папку через прямой поиск по ID
          const parentFolder = findFolderById(bookmarks, parentId)
          if (parentFolder) {
            // Инициализируем children если нужно
            if (!parentFolder.children) {
              parentFolder.children = []
            }
            parentFolder.children.push(newBookmark)
            added = true
            console.log(
              `Элемент добавлен в папку ${parentFolder.title} (ID: ${parentId}) через прямой поиск`
            )
          } else {
            // Добавляем в корневую папку, если не смогли найти родительскую
            bookmarks.push(newBookmark)
            added = true
            console.log(`Элемент добавлен в корневую папку (запасной вариант)`)
          }
        }
      }
    }

    if (added) {
      console.log(`Сохранение обновленных закладок в хранилище`)
      await storage.set("gh_bookmarks", bookmarks)
      return newBookmark
    } else {
      console.error(`Не удалось добавить элемент ${title} в папку ${parentId}`)
      return null
    }
  } catch (error) {
    console.error(`Ошибка при создании элемента ${title}:`, error)
    return null
  }
}

// Получить закладки из папки
export async function getBookmarksFromFolder(folderId) {
  const bookmarks = await getStoredBookmarks()

  if (folderId === "0") {
    return bookmarks
  }

  function findFolder(items) {
    for (const item of items) {
      if (item.id === folderId) {
        return item.children || []
      }
      if (item.type === "folder" && item.children) {
        const found = findFolder(item.children)
        if (found) return found
      }
    }
    return null
  }

  return findFolder(bookmarks) || []
}

// Сохранить все закладки
export async function saveBookmarks(bookmarks) {
  await storage.set("gh_bookmarks", bookmarks)
}

// Получить favicon для URL
export async function getFavicon(url) {
  try {
    if (!url) {
      console.warn("getFavicon: URL не указан")
      return "/assets/icons/link.svg"
    }

    // Проверка, является ли URL валидным
    let urlObj
    try {
      urlObj = new URL(url)
    } catch (e) {
      console.warn(`Неверный формат URL для getFavicon: ${url}`)
      return "/assets/icons/link.svg"
    }

    // Прямая ссылка на favicon.ico (самый надежный метод)
    try {
      const faviconUrl = `${urlObj.origin}/favicon.ico`
      // Проверяем доступность
      console.log(`Пробуем получить фавикон напрямую: ${faviconUrl}`)
      const response = await fetch(faviconUrl, {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-cache",
      })
      // Если получили ответ, используем этот URL
      return faviconUrl
    } catch (error) {
      console.warn("Не удалось получить favicon напрямую:", error)
      // Продолжаем со следующей стратегией
    }

    // Google Favicon Service (очень надежный сервис для иконок)
    try {
      const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
        urlObj.hostname
      )}&sz=32`
      console.log(`Пробуем получить фавикон через Google: ${googleFaviconUrl}`)
      return googleFaviconUrl
    } catch (error) {
      console.warn("Не удалось получить favicon через Google:", error)
      // Продолжаем со следующей стратегией
    }

    // Chrome Favicon API (работает только в расширениях)
    try {
      return `chrome://favicon/${urlObj.origin}`
    } catch (error) {
      console.warn("Не удалось получить favicon через Chrome API:", error)
    }

    console.warn(`Не удалось получить favicon для URL: ${url}`)
    return "/assets/icons/link.svg"
  } catch (error) {
    console.error("Ошибка при получении favicon:", error)
    return "/assets/icons/link.svg"
  }
}

// Вспомогательные функции
function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

function findFolderById(bookmarks, folderId) {
  for (const bookmark of bookmarks) {
    if (bookmark.id === folderId) {
      return bookmark
    }
    if (bookmark.children) {
      const found = findFolderById(bookmark.children, folderId)
      if (found) return found
    }
  }
  return null
}

function addBookmarkToFolder(bookmarks, parentId, newBookmark) {
  return bookmarks.map((bookmark) => {
    if (bookmark.id === parentId) {
      return {
        ...bookmark,
        children: [...(bookmark.children || []), newBookmark],
      }
    }
    if (bookmark.children) {
      return {
        ...bookmark,
        children: addBookmarkToFolder(bookmark.children, parentId, newBookmark),
      }
    }
    return bookmark
  })
}

// Добавляем в глобальное пространство для доступа из других модулей
if (typeof window !== "undefined") {
  window.getFavicon = getFavicon
}

// Массовое обновление фавиконов для всех закладок
export async function updateAllFavicons(progressCallback) {
  try {
    const bookmarks = await getStoredBookmarks()
    let total = 0
    let processed = 0

    // Сначала подсчитаем общее количество закладок
    function countBookmarks(items) {
      for (const item of items) {
        if (item.type === "bookmark") {
          total++
        }
        if (item.type === "folder" && item.children) {
          countBookmarks(item.children)
        }
      }
    }

    countBookmarks(bookmarks)

    // Теперь обновляем фавиконы
    async function updateFavicons(items) {
      const updatedItems = [...items]

      for (let i = 0; i < updatedItems.length; i++) {
        const item = updatedItems[i]

        if (item.type === "bookmark" && item.url) {
          try {
            const faviconUrl = await getFavicon(item.url)
            if (faviconUrl && faviconUrl !== "/assets/icons/link.svg") {
              updatedItems[i] = {
                ...item,
                favicon: faviconUrl,
              }
            }

            processed++
            if (progressCallback) {
              progressCallback(processed, total)
            }
          } catch (error) {
            console.warn(
              `Ошибка при обновлении фавикона для ${item.url}:`,
              error
            )
            processed++
            if (progressCallback) {
              progressCallback(processed, total)
            }
          }
        }

        if (item.type === "folder" && item.children) {
          updatedItems[i] = {
            ...item,
            children: await updateFavicons(item.children),
          }
        }
      }

      return updatedItems
    }

    const updatedBookmarks = await updateFavicons(bookmarks)
    await saveBookmarks(updatedBookmarks)

    return {
      success: true,
      total,
      updated: processed,
    }
  } catch (error) {
    console.error("Ошибка при массовом обновлении фавиконов:", error)
    return {
      success: false,
      error: error.message,
    }
  }
}

// Сохранить настройку отображения фавиконов
export async function setFaviconsEnabled(enabled) {
  console.log(`setFaviconsEnabled: устанавливаем состояние ${enabled}`)
  try {
    await storage.set("favicons_enabled", enabled)
    // Для отладки - проверим сразу, что значение сохранилось
    const savedValue = await storage.get("favicons_enabled")
    console.log(`setFaviconsEnabled: проверка после сохранения: ${savedValue}`)
    return true
  } catch (error) {
    console.error("Ошибка при сохранении настройки фавиконов:", error)
    return false
  }
}

// Получить настройку отображения фавиконов
export async function getFaviconsEnabled() {
  try {
    const result = await storage.get("favicons_enabled")
    console.log(`getFaviconsEnabled: получено значение из хранилища:`, result)
    // По умолчанию выключено, чтобы не нагружать систему
    const enabled =
      result === true || result === "true" || result?.favicons_enabled === true
    console.log(`getFaviconsEnabled: итоговое значение: ${enabled}`)
    return enabled
  } catch (error) {
    console.error("Ошибка при получении настройки фавиконов:", error)
    return false
  }
}

// Удалить все фавиконы для закладок
export async function clearAllFavicons() {
  try {
    const bookmarks = await getStoredBookmarks()

    function removeFavicons(items) {
      return items.map((item) => {
        if (item.type === "bookmark") {
          const { favicon, ...rest } = item
          return rest
        }

        if (item.type === "folder" && item.children) {
          return {
            ...item,
            children: removeFavicons(item.children),
          }
        }

        return item
      })
    }

    const updatedBookmarks = removeFavicons(bookmarks)
    await saveBookmarks(updatedBookmarks)

    return { success: true }
  } catch (error) {
    console.error("Ошибка при удалении фавиконов:", error)
    return {
      success: false,
      error: error.message,
    }
  }
}
