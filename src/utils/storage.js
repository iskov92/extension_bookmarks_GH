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
      // Получаем favicon через новую быструю функцию
      try {
        console.log(`Загрузка фавикона для ${url}...`)
        newBookmark.favicon = await getFaviconFast(url)
        console.log(`Получен фавикон: ${newBookmark.favicon}`)
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

// Получить фавикон из HTML-документа
async function getFaviconFromHTML(url) {
  try {
    // Проверка, является ли URL валидным
    let urlObj
    try {
      urlObj = new URL(url)
    } catch (e) {
      console.warn(`Неверный формат URL для getFaviconFromHTML: ${url}`)
      return null
    }

    console.log(
      `Пробуем получить HTML документ для: ${url} через background script`
    )

    // Отправляем запрос в background script для получения HTML
    const htmlResponse = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "getHtmlContent", url },
        (response) => resolve(response)
      )
    })

    if (!htmlResponse || !htmlResponse.success) {
      console.warn(
        `Не удалось получить HTML через background script: ${
          htmlResponse?.error || "Неизвестная ошибка"
        }`
      )

      // Пробуем запросить проверку известных путей через background script
      const knownPaths = [
        "/favicon.ico",
        "/favicon.png",
        "/apple-touch-icon.png",
        "/apple-touch-icon-precomposed.png",
        "/static/favicon.ico",
        "/static/favicon.png",
        "/assets/favicon.ico",
        "/assets/favicon.png",
      ]

      const pathCheckResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: "checkFaviconPaths",
            url: urlObj.origin,
            paths: knownPaths,
          },
          (response) => resolve(response)
        )
      })

      if (
        pathCheckResponse &&
        pathCheckResponse.success &&
        pathCheckResponse.results
      ) {
        // Находим первый существующий фавикон
        const existingFavicon = pathCheckResponse.results.find(
          (result) => result.exists
        )
        if (existingFavicon) {
          console.log(
            `Найден фавикон по известному пути: ${existingFavicon.url}`
          )
          return existingFavicon.url
        }
      }

      return null
    }

    // Отправляем HTML в background script для извлечения фавиконов
    const extractResponse = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: "extractFavicons",
          html: htmlResponse.htmlContent,
          baseUrl: url,
        },
        (response) => resolve(response)
      )
    })

    if (
      !extractResponse ||
      !extractResponse.success ||
      !extractResponse.favicons ||
      extractResponse.favicons.length === 0
    ) {
      console.warn(
        `Не удалось извлечь фавиконы из HTML: ${
          extractResponse?.error || "Нет доступных фавиконов"
        }`
      )
      return null
    }

    console.log(`Найдено ${extractResponse.favicons.length} фавиконов в HTML`)
    return extractResponse.favicons[0].url
  } catch (error) {
    console.error("Ошибка при извлечении фавикона из HTML:", error)
    return null
  }
}

// Кэш фавиконов для оптимизации производительности
const faviconCache = new Map()
const FAVICON_CACHE_MAX_SIZE = 200 // Ограничиваем размер кэша
const FAVICON_CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000 // Неделя в миллисекундах

// Очистка устаревших записей в кэше
function cleanupFaviconCache() {
  if (faviconCache.size > FAVICON_CACHE_MAX_SIZE) {
    console.log(`Очистка кэша фавиконов (размер: ${faviconCache.size})`)
    const now = Date.now()
    const keysToDelete = []

    // Находим устаревшие записи
    faviconCache.forEach((value, key) => {
      if (now - value.timestamp > FAVICON_CACHE_EXPIRY) {
        keysToDelete.push(key)
      }
    })

    // Удаляем устаревшие записи
    keysToDelete.forEach((key) => faviconCache.delete(key))
    console.log(`Удалено ${keysToDelete.length} устаревших фавиконов из кэша`)

    // Если кэш все еще слишком большой, удаляем самые старые записи
    if (faviconCache.size > FAVICON_CACHE_MAX_SIZE * 0.8) {
      const entries = Array.from(faviconCache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )

      const toDelete = Math.floor(entries.length * 0.3) // Удаляем 30% самых старых
      for (let i = 0; i < toDelete; i++) {
        faviconCache.delete(entries[i][0])
      }
      console.log(`Дополнительно удалено ${toDelete} старых фавиконов из кэша`)
    }
  }
}

// Получить favicon для URL с кэшированием
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

    // Домен для использования в запросах фавиконов
    const domain = urlObj.hostname

    // Проверяем кэш по домену
    if (faviconCache.has(domain)) {
      const cachedFavicon = faviconCache.get(domain)

      // Проверяем срок действия кэша (24 часа)
      if (Date.now() - cachedFavicon.timestamp < 24 * 60 * 60 * 1000) {
        console.log(
          `Использован кэшированный фавикон для ${domain}: ${cachedFavicon.url}`
        )
        return cachedFavicon.url
      } else {
        console.log(
          `Кэшированный фавикон для ${domain} устарел, загружаем новый`
        )
        // Кэш устарел, удаляем запись
        faviconCache.delete(domain)
      }
    }

    // Список возможных высококачественных источников фавиконов
    const sources = [
      // 1. Высококачественные Apple Touch Icons (обычно имеют размер 180x180 или 192x192)
      `https://${domain}/apple-touch-icon.png`,
      `https://${domain}/apple-touch-icon-precomposed.png`,

      // 2. favicon.svg - векторный формат (наивысшее качество при любом масштабировании)
      `https://${domain}/favicon.svg`,

      // 3. Распространенные HD фавиконы (192px - стандарт для PWA)
      `https://${domain}/favicon-192x192.png`,
      `https://${domain}/favicon-196x196.png`,
      `https://${domain}/favicon-152x152.png`,

      // 4. DuckDuckGo - улучшенные фавиконы
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,

      // 5. Google Favicon Service - надежный, но не HD (используем максимальный доступный размер)
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
        domain
      )}&sz=128`,

      // 6. Стандартные пути к favicon.ico
      `https://${domain}/favicon.ico`,
    ]

    // Функция для проверки, что изображение загружается
    const checkImage = (url) => {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () =>
          resolve({ url, width: img.width, height: img.height })
        img.onerror = () => reject(new Error(`Не удалось загрузить ${url}`))
        img.src = url

        // Таймаут 1.5 секунды для каждой проверки, чтобы не задерживать UI
        setTimeout(() => reject(new Error(`Таймаут для ${url}`)), 1500)
      })
    }

    try {
      // Для сверхнадежности добавим проверку manifest.json, который часто содержит высококачественные иконки
      try {
        // Запрашиваем manifest.json, который может содержать HD фавиконы
        const manifestResponse = await fetch(
          `https://${domain}/manifest.json`,
          {
            method: "GET",
            mode: "cors",
            cache: "force-cache",
            credentials: "omit",
            headers: { Accept: "application/json" },
            timeout: 2000,
          }
        ).then((response) => {
          if (!response.ok) throw new Error("Манифест не найден")
          return response.json()
        })

        // Если манифест содержит иконки, добавляем их в начало списка источников
        if (
          manifestResponse &&
          manifestResponse.icons &&
          manifestResponse.icons.length > 0
        ) {
          // Сортируем иконки по размеру (от большего к меньшему)
          const manifestIcons = manifestResponse.icons
            .filter((icon) => icon.src && (icon.sizes || icon.size))
            .sort((a, b) => {
              const sizeA = parseInt((a.sizes || a.size || "0x0").split("x")[0])
              const sizeB = parseInt((b.sizes || b.size || "0x0").split("x")[0])
              return sizeB - sizeA
            })

          if (manifestIcons.length > 0) {
            // Берем самую большую иконку и добавляем ее в начало списка
            const largestIcon = manifestIcons[0]
            const iconUrl = new URL(largestIcon.src, `https://${domain}`).href
            sources.unshift(iconUrl)
            console.log(`Добавлен фавикон из манифеста: ${iconUrl}`)
          }
        }
      } catch (e) {
        console.warn("Не удалось получить манифест:", e)
      }

      // Проверяем параллельно все источники и используем первый успешный
      const results = await Promise.any(sources.map((src) => checkImage(src)))
      console.log(
        `Успешно получен фавикон высокого качества: ${results.url} (${results.width}x${results.height}px)`
      )

      // Сохраняем в кэш
      faviconCache.set(domain, {
        url: results.url,
        timestamp: Date.now(),
        width: results.width,
        height: results.height,
      })

      // Очищаем кэш при необходимости
      cleanupFaviconCache()

      return results.url
    } catch (error) {
      // Если все проверки провалились, возвращаем Google как наиболее надежный
      console.warn(
        "Не удалось проверить все источники фавиконов, используем Google:",
        error
      )
      const fallbackUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
        domain
      )}&sz=128`

      // Сохраняем в кэш запасной вариант
      faviconCache.set(domain, {
        url: fallbackUrl,
        timestamp: Date.now(),
        width: 128,
        height: 128,
      })

      return fallbackUrl
    }
  } catch (error) {
    console.error("Ошибка при получении favicon:", error)

    // В случае любой ошибки, возвращаем Google Favicon как самый надежный вариант
    try {
      const domain = new URL(url).hostname
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
        domain
      )}&sz=128`
    } catch (e) {
      return "/assets/icons/link.svg"
    }
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
    const allBookmarksList = []
    let processed = 0
    let successfullyUpdated = 0

    // Собираем все закладки в плоский список для параллельной обработки
    function collectBookmarks(items, parentPath = []) {
      for (const item of items) {
        const currentPath = [...parentPath, item.id]

        if (item.type === "bookmark" && item.url) {
          allBookmarksList.push({
            item,
            path: currentPath,
          })
        }

        if (item.type === "folder" && item.children) {
          collectBookmarks(item.children, currentPath)
        }
      }
    }

    collectBookmarks(bookmarks)
    const total = allBookmarksList.length

    // Если нет закладок, сразу возвращаем результат
    if (total === 0) {
      return {
        success: true,
        total: 0,
        updated: 0,
      }
    }

    // Обновляем все фавиконы параллельно с ограничением количества одновременных запросов
    const BATCH_SIZE = 20 // Максимальное количество одновременных запросов
    const updatedBookmarks = [...bookmarks] // Копируем структуру для обновления

    // Функция для обновления одной закладки
    async function updateSingleFavicon(bookmarkInfo) {
      try {
        const { item, path } = bookmarkInfo

        // Используем быструю функцию для получения фавикона
        const faviconUrl = await getFaviconFast(item.url)

        // Если получили фавикон и он отличается от существующего или его не было
        if (faviconUrl && (!item.favicon || faviconUrl !== item.favicon)) {
          // Обновляем фавикон в нашей копии структуры
          let current = updatedBookmarks

          // Проходим по пути до нужной закладки, кроме последнего элемента
          for (let i = 0; i < path.length - 1; i++) {
            const pathSegment = path[i]
            const index = current.findIndex((el) => el.id === pathSegment)
            if (index !== -1) {
              current = current[index].children
            } else {
              throw new Error(`Путь к закладке не найден: ${path.join("/")}`)
            }
          }

          // Находим и обновляем саму закладку
          const bookmarkIndex = current.findIndex(
            (el) => el.id === path[path.length - 1]
          )
          if (bookmarkIndex !== -1) {
            current[bookmarkIndex].favicon = faviconUrl
            successfullyUpdated++
          }
        }

        return true
      } catch (error) {
        console.warn(
          `Ошибка при обновлении фавикона для ${bookmarkInfo.item.url}:`,
          error
        )
        return false
      } finally {
        processed++
        if (progressCallback) {
          progressCallback(processed, total, successfullyUpdated)
        }
      }
    }

    // Обрабатываем закладки порциями для контроля над нагрузкой
    for (let i = 0; i < allBookmarksList.length; i += BATCH_SIZE) {
      const batch = allBookmarksList.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map(updateSingleFavicon))
    }

    // Сохраняем результат только если были обновления
    if (successfullyUpdated > 0) {
      await saveBookmarks(updatedBookmarks)
    }

    return {
      success: true,
      total,
      updated: successfullyUpdated,
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
    // По умолчанию выключено, чтобы не нагружать систему
    return (
      result === true || result === "true" || result?.favicons_enabled === true
    )
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

// Обновить фавикон для отдельной закладки
export async function updateBookmarkFavicon(bookmarkId) {
  try {
    // Получаем все закладки
    const bookmarks = await getStoredBookmarks()

    // Функция для плоского поиска закладки по ID
    function findBookmarkById(items, path = []) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const currentPath = [...path, i]

        if (item.id === bookmarkId) {
          return { item, path: currentPath }
        }

        if (item.type === "folder" && Array.isArray(item.children)) {
          const found = findBookmarkById(item.children, [
            ...path,
            i,
            "children",
          ])
          if (found) return found
        }
      }
      return null
    }

    // Ищем закладку в дереве
    const found = findBookmarkById(bookmarks)

    if (!found || found.item.type !== "bookmark" || !found.item.url) {
      return {
        success: false,
        error: "Закладка не найдена или не имеет URL",
      }
    }

    // Быстрое получение фавикона
    const faviconUrl = await getFaviconFast(found.item.url)

    // Если фавикон не изменился или не получен, возвращаем результат без сохранения
    if (!faviconUrl || faviconUrl === found.item.favicon) {
      return {
        success: true,
        updated: false,
        url: found.item.url,
        title: found.item.title,
      }
    }

    // Прямое обновление закладки по найденному пути
    let current = bookmarks
    const pathSegments = found.path

    for (let i = 0; i < pathSegments.length - 1; i++) {
      const segment = pathSegments[i]

      if (segment === "children") {
        continue // Пропускаем сегмент 'children', так как мы уже перешли к массиву children
      }

      current = current[segment]

      // Если следующий сегмент - 'children', переходим к массиву children
      if (pathSegments[i + 1] === "children") {
        current = current.children
        i++ // Пропускаем следующий шаг
      }
    }

    // Обновляем фавикон в найденной закладке
    const lastIndex = pathSegments[pathSegments.length - 1]
    current[lastIndex].favicon = faviconUrl

    // Сохраняем изменения
    await saveBookmarks(bookmarks)

    return {
      success: true,
      updated: true,
      url: found.item.url,
      title: found.item.title,
      favicon: faviconUrl,
    }
  } catch (error) {
    console.error("Ошибка при обновлении фавикона закладки:", error)
    return {
      success: false,
      error: error.message,
    }
  }
}

// Функция для получения размера изображения
async function getImageSize(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.width, height: img.height })
    img.onerror = (err) =>
      reject(new Error(`Не удалось загрузить изображение: ${err}`))
    img.src = url

    // Таймаут 2 секунды
    setTimeout(
      () => reject(new Error("Таймаут при загрузке изображения")),
      2000
    )
  })
}

// Быстрый прямой доступ к фавиконам высокого качества без дополнительных проверок
export async function getFaviconFast(url) {
  try {
    if (!url) return "/assets/icons/link.svg"

    // Быстрая проверка URL
    let urlObj
    try {
      urlObj = new URL(url)
    } catch (e) {
      return "/assets/icons/link.svg"
    }

    const domain = urlObj.hostname
    const fullPath = urlObj.pathname

    // Кэш фавиконов в памяти
    if (!window.faviconDirectCache) {
      window.faviconDirectCache = {}
    }

    // Специальные проверки для Google сервисов
    // 1. Google Drive
    if (domain === "drive.google.com") {
      return "https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png"
    }

    // 2. YouTube channels
    if (domain === "www.youtube.com" || domain === "youtube.com") {
      // Обрабатываем все YouTube URL, включая видео, каналы, плейлисты
      if (
        fullPath.includes("/channel/") ||
        fullPath.includes("/user/") ||
        fullPath.includes("/c/") ||
        fullPath.includes("/playlists") ||
        fullPath.includes("/watch") ||
        fullPath.includes("/shorts/") ||
        fullPath.includes("/feed/") ||
        urlObj.search.includes("list=") || // Добавлена проверка параметра list для плейлистов
        fullPath.includes("/playlist") || // Добавлена проверка пути playlist
        fullPath === "/" // Главная страница YouTube
      ) {
        return "https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png"
      }
      // Для любого YouTube URL, который не попал в предыдущие условия
      return "https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png"
    }

    // 3. Google Docs
    if (domain === "docs.google.com") {
      // Проверки для простых URL без идентификатора документа
      if (
        fullPath === "/" ||
        fullPath === "/document/" ||
        fullPath.startsWith("/document") ||
        fullPath === "/document"
      ) {
        return "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico"
      }

      // Распознаем тип документа Google Docs по URL пути
      const pathParts = fullPath.split("/").filter((part) => part)

      // Проверка на URL с id документа (например, /document/d/{docId}/edit)
      if (fullPath.includes("/document/d/")) {
        return "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico"
      }

      if (fullPath.includes("/spreadsheets/d/")) {
        return "https://ssl.gstatic.com/docs/spreadsheets/favicon3.ico"
      }

      if (fullPath.includes("/presentation/d/")) {
        return "https://ssl.gstatic.com/docs/presentations/images/favicon5.ico"
      }

      if (fullPath.includes("/forms/d/")) {
        return "https://ssl.gstatic.com/docs/forms/device_home/android_192.png"
      }

      if (fullPath.includes("/drawings/d/")) {
        return "https://ssl.gstatic.com/docs/drawings/favicon/favicon-drawing-hd.png"
      }

      // Если в пути есть docId, но тип не определен выше
      if (fullPath.includes("/d/")) {
        return "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico"
      }

      // Стандартная обработка по первому сегменту пути
      if (pathParts.length > 0) {
        const docType = pathParts[0]

        // Распознаем различные типы документов Google
        const googleDocsIcons = {
          document:
            "https://ssl.gstatic.com/docs/documents/images/kix-favicon-hd-v2.png",
          spreadsheets:
            "https://ssl.gstatic.com/docs/spreadsheets/favicon3.ico",
          presentation:
            "https://ssl.gstatic.com/docs/presentations/images/favicon5.ico",
          forms:
            "https://ssl.gstatic.com/docs/forms/device_home/android_192.png",
          drawings:
            "https://ssl.gstatic.com/docs/drawings/favicon/favicon-drawing-hd.png",
        }

        if (googleDocsIcons[docType]) {
          return googleDocsIcons[docType]
        }
      }

      // Если не определили точный тип, возвращаем иконку Google Docs по умолчанию
      return "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico"
    }

    // Создаем уникальный ключ для кэша
    let cacheKey = domain

    // Проверяем кэш
    if (window.faviconDirectCache[cacheKey]) {
      return window.faviconDirectCache[cacheKey]
    }

    // Список специальных случаев для популярных сайтов (оставляем как есть)
    const specialCases = {
      // Популярные социальные сети
      "youtube.com":
        "https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png",
      "www.youtube.com":
        "https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png",
      "facebook.com":
        "https://static.xx.fbcdn.net/rsrc.php/yD/r/d4ZIVX-5C-b.ico",
      "www.facebook.com":
        "https://static.xx.fbcdn.net/rsrc.php/yD/r/d4ZIVX-5C-b.ico",
      "twitter.com":
        "https://abs.twimg.com/responsive-web/web/icon-ios.b1fc727a.png",
      "www.twitter.com":
        "https://abs.twimg.com/responsive-web/web/icon-ios.b1fc727a.png",
      "instagram.com":
        "https://www.instagram.com/static/images/ico/apple-touch-icon-180x180-precomposed.png/c06fdb2357bd.png",
      "www.instagram.com":
        "https://www.instagram.com/static/images/ico/apple-touch-icon-180x180-precomposed.png/c06fdb2357bd.png",
      "linkedin.com": "https://static.licdn.com/sc/h/2if24wp7oqlodqdlgei1n1520",
      "www.linkedin.com":
        "https://static.licdn.com/sc/h/2if24wp7oqlodqdlgei1n1520",

      // Поисковые системы
      "google.com":
        "https://www.google.com/images/branding/product/ico/googleg_lodp.ico",
      "www.google.com":
        "https://www.google.com/images/branding/product/ico/googleg_lodp.ico",
      "bing.com": "https://www.bing.com/sa/simg/bing_p_rr_teal_min.ico",
      "www.bing.com": "https://www.bing.com/sa/simg/bing_p_rr_teal_min.ico",
      "yandex.ru":
        "https://yastatic.net/iconostasis/_/8lFaTfLDdj3-1ap-eMeEiQ5d8uI.png",
      "www.yandex.ru":
        "https://yastatic.net/iconostasis/_/8lFaTfLDdj3-1ap-eMeEiQ5d8uI.png",

      // Почтовые сервисы
      "gmail.com":
        "https://www.gstatic.com/images/branding/product/1x/gmail_512dp.png",
      "outlook.com":
        "https://outlook-1.cdn.office.net/assets/clear.r7KmX24vzmV.png",
      "www.outlook.com":
        "https://outlook-1.cdn.office.net/assets/clear.r7KmX24vzmV.png",

      // Популярные магазины
      "amazon.com": "https://www.amazon.com/favicon.ico",
      "www.amazon.com": "https://www.amazon.com/favicon.ico",
      "ebay.com": "https://pages.ebay.com/favicon.ico",
      "www.ebay.com": "https://pages.ebay.com/favicon.ico",

      // Развлекательные платформы
      "netflix.com":
        "https://assets.nflxext.com/us/ffe/siteui/common/icons/nficon2016.ico",
      "www.netflix.com":
        "https://assets.nflxext.com/us/ffe/siteui/common/icons/nficon2016.ico",
      "twitch.tv":
        "https://static.twitchcdn.net/assets/favicon-32-d6025c14e900565d6177.png",
      "www.twitch.tv":
        "https://static.twitchcdn.net/assets/favicon-32-d6025c14e900565d6177.png",

      // Популярные новостные сайты
      "cnn.com": "https://www.cnn.com/media/sites/cnn/apple-touch-icon.png",
      "www.cnn.com": "https://www.cnn.com/media/sites/cnn/apple-touch-icon.png",
      "bbc.com":
        "https://static.files.bbci.co.uk/core/website/assets/static/bbc-icon-196.d36e7f0c85ccd9a3e10c2be8964c0d67.png",
      "www.bbc.com":
        "https://static.files.bbci.co.uk/core/website/assets/static/bbc-icon-196.d36e7f0c85ccd9a3e10c2be8964c0d67.png",

      // Технологические компании
      "apple.com": "https://www.apple.com/favicon.ico",
      "www.apple.com": "https://www.apple.com/favicon.ico",
      "microsoft.com": "https://c.s-microsoft.com/favicon.ico",
      "www.microsoft.com": "https://c.s-microsoft.com/favicon.ico",
      "github.com": "https://github.githubassets.com/favicons/favicon.svg",
      "www.github.com": "https://github.githubassets.com/favicons/favicon.svg",
    }

    // Проверяем, есть ли домен в специальных случаях
    if (specialCases[domain]) {
      const specialUrl = specialCases[domain]
      window.faviconDirectCache[cacheKey] = specialUrl // Кэшируем
      return specialUrl
    }

    // Быстрый выбор фавикона без дополнительных проверок качества
    // Просто выбираем первый доступный источник

    // Стратегия 1: Используем DuckDuckGo или Google (всегда работают)
    const quickSources = [
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
    ]

    // Выбираем первый источник и сразу кэшируем
    const bestFavicon = quickSources[0]
    window.faviconDirectCache[cacheKey] = bestFavicon

    return bestFavicon
  } catch (error) {
    console.error("Ошибка в getFaviconFast:", error)
    return `/assets/icons/link.svg`
  }
}
