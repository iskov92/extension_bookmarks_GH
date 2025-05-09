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
        const value =
          result && typeof result === "object" ? result[key] : undefined
        resolve(value)
      })
    })
  }

  async set(key, value) {
    return new Promise((resolve, reject) => {
      try {
        const data = { [key]: value }
        chrome.storage.local.set(data, () => {
          if (chrome.runtime.lastError) {
            console.error(
              `Ошибка при сохранении ${key}:`,
              chrome.runtime.lastError
            )
            reject(chrome.runtime.lastError)
          } else {
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

// Сохранить все закладки
export async function saveBookmarks(bookmarks) {
  await storage.set("gh_bookmarks", bookmarks)
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

// Создать новую закладку в хранилище
export async function createStoredBookmark(parentId, title, url = "") {
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

    if (url) {
      newBookmark.url = url
      // Получаем favicon через быструю функцию
      try {
        newBookmark.favicon = await getFaviconFast(url)
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
    } else {
      // Проверка существования родительской папки
      const folderExists = findFolderById(bookmarks, parentId) !== null

      if (!folderExists) {
        console.error(`Родительская папка с ID ${parentId} не существует!`)

        // Добавляем в корневую папку вместо отсутствующей
        bookmarks.push(newBookmark)
        added = true
      } else {
        // Добавляем элемент в найденную родительскую папку
        function addToFolder(items) {
          for (const item of items) {
            if (item.id === parentId) {
              // Убедимся, что у папки есть свойство children
              if (!item.children) {
                item.children = []
              }

              item.children.push(newBookmark)
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
          // Последняя попытка найти папку через прямой поиск по ID
          const parentFolder = findFolderById(bookmarks, parentId)
          if (parentFolder) {
            // Инициализируем children если нужно
            if (!parentFolder.children) {
              parentFolder.children = []
            }
            parentFolder.children.push(newBookmark)
            added = true
          } else {
            // Добавляем в корневую папку, если не смогли найти родительскую
            bookmarks.push(newBookmark)
            added = true
          }
        }
      }
    }

    if (added) {
      await saveBookmarks(bookmarks)
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

// Вспомогательные функции
export function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

export function findFolderById(bookmarks, folderId) {
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

export function addBookmarkToFolder(bookmarks, parentId, newBookmark) {
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

// Кэш фавиконов для оптимизации производительности
const faviconCache = new Map()
const FAVICON_CACHE_MAX_SIZE = 200 // Ограничиваем размер кэша
const FAVICON_CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000 // Неделя в миллисекундах

// Очистка устаревших записей в кэше
function cleanupFaviconCache() {
  if (faviconCache.size > FAVICON_CACHE_MAX_SIZE) {
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

    // Если кэш все еще слишком большой, удаляем самые старые записи
    if (faviconCache.size > FAVICON_CACHE_MAX_SIZE * 0.8) {
      const entries = Array.from(faviconCache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )

      const toDelete = Math.floor(entries.length * 0.3) // Удаляем 30% самых старых
      for (let i = 0; i < toDelete; i++) {
        faviconCache.delete(entries[i][0])
      }
    }
  }
}

/**
 * Проверяет доступность изображения
 */
function checkImageAvailability(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = url

    // Таймаут 1.5 секунды
    setTimeout(() => resolve(false), 1500)
  })
}

/**
 * Быстрый прямой доступ к фавиконам для массового обновления фавиконов
 * Порядок получения:
 * 1. Специальные случаи для популярных сервисов
 * 2. DuckDuckGo как основной источник
 * 3. Google Favicon Service как резервный
 * 4. Стандартный логотип расширения
 */
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

    // Создаем уникальный ключ для кэша
    let cacheKey = domain

    // Проверяем кэш
    if (window.faviconDirectCache[cacheKey]) {
      return window.faviconDirectCache[cacheKey]
    }

    // Специальные проверки для Google сервисов
    // 1. Google Drive
    if (domain === "drive.google.com") {
      return "https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png"
    }

    // 2. YouTube channels и плейлисты
    if (domain === "www.youtube.com" || domain === "youtube.com") {
      if (fullPath.includes("/playlist") || url.includes("list=")) {
        return "https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png"
      }
      return "https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png"
    }

    // 3. Google Docs
    if (domain === "docs.google.com") {
      // Проверка на URL с id документа (например, /document/d/{docId}/edit)
      if (fullPath.includes("/document")) {
        return "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico"
      }

      if (fullPath.includes("/spreadsheets")) {
        return "https://ssl.gstatic.com/docs/spreadsheets/favicon3.ico"
      }

      if (fullPath.includes("/presentation")) {
        return "https://ssl.gstatic.com/docs/presentations/images/favicon5.ico"
      }

      if (fullPath.includes("/forms")) {
        return "https://ssl.gstatic.com/docs/forms/device_home/android_192.png"
      }

      if (fullPath.includes("/drawings")) {
        return "https://ssl.gstatic.com/docs/drawings/favicon/favicon-drawing-hd.png"
      }

      // Если не определили точный тип, возвращаем иконку Google Docs по умолчанию
      return "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico"
    }

    // Список специальных случаев для популярных сайтов
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

      // Google сервисы
      "google.com":
        "https://www.google.com/images/branding/product/ico/googleg_lodp.ico",
      "www.google.com":
        "https://www.google.com/images/branding/product/ico/googleg_lodp.ico",
      "github.com": "https://github.githubassets.com/favicons/favicon.svg",
      "www.github.com": "https://github.githubassets.com/favicons/favicon.svg",
    }

    // Проверяем, есть ли домен в специальных случаях
    if (specialCases[domain]) {
      const specialUrl = specialCases[domain]
      window.faviconDirectCache[cacheKey] = specialUrl // Кэшируем
      return specialUrl
    }

    // 1. Первый выбор: DuckDuckGo - быстрый и качественный источник фавиконов
    try {
      const duckDuckGoUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`

      // Кэшируем URL DuckDuckGo и возвращаем его без проверки доступности для скорости
      window.faviconDirectCache[cacheKey] = duckDuckGoUrl
      return duckDuckGoUrl
    } catch (e) {
      // продолжаем с Google Favicon Service
    }

    // 2. Второй выбор: Google Favicon Service как запасной вариант
    try {
      const googleUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`

      // Кэшируем URL Google и возвращаем его
      window.faviconDirectCache[cacheKey] = googleUrl
      return googleUrl
    } catch (e) {
      // используем стандартную иконку
    }

    // 3. Последний вариант: стандартная иконка расширения
    try {
      const baseUrl = chrome.runtime.getURL("/")
      const standardIcon = `${baseUrl}assets/icons/link.svg`
      window.faviconDirectCache[cacheKey] = standardIcon // Кэшируем
      return standardIcon
    } catch (e) {
      return "/assets/icons/link.svg"
    }
  } catch (error) {
    return `/assets/icons/link.svg`
  }
}

/**
 * Получить favicon для URL - полная версия с кэшированием и расширенными проверками
 */
export async function getFavicon(url) {
  try {
    if (!url) {
      return "/assets/icons/link.svg"
    }

    // Проверка, является ли URL валидным
    let urlObj
    try {
      urlObj = new URL(url)
    } catch (e) {
      return "/assets/icons/link.svg"
    }

    // Домен для использования в запросах фавиконов
    const domain = urlObj.hostname

    // Проверяем кэш по домену
    if (faviconCache.has(domain)) {
      const cachedFavicon = faviconCache.get(domain)

      // Проверяем срок действия кэша (24 часа)
      if (Date.now() - cachedFavicon.timestamp < 24 * 60 * 60 * 1000) {
        return cachedFavicon.url
      } else {
        // Кэш устарел, удаляем запись
        faviconCache.delete(domain)
      }
    }

    // Используем быструю функцию как основной источник
    const faviconUrl = await getFaviconFast(url)

    // Сохраняем в кэш
    faviconCache.set(domain, {
      url: faviconUrl,
      timestamp: Date.now(),
    })

    // Очищаем кэш при необходимости
    cleanupFaviconCache()

    return faviconUrl
  } catch (error) {
    return "/assets/icons/link.svg"
  }
}

/**
 * Получить надежный фавикон через Google для ручного обновления
 */
export async function getGoogleFavicon(url) {
  try {
    if (!url) return "/assets/icons/link.svg"

    // Проверка URL
    let urlObj
    try {
      urlObj = new URL(url)
    } catch (e) {
      return "/assets/icons/link.svg"
    }

    const domain = urlObj.hostname

    // Создаем URL для Google Favicon Service с максимальным размером
    const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`

    // Если не удалось получить фавикон, возвращаем стандартный логотип
    try {
      const baseUrl = chrome.runtime.getURL("/")
      return googleFaviconUrl
    } catch (e) {
      // Если не удалось получить URL расширения, используем специальный маркер
      return "$EXTENSION_PATH$/assets/icons/link.svg"
    }
  } catch (error) {
    return "$EXTENSION_PATH$/assets/icons/link.svg"
  }
}

/**
 * РУЧНОЕ ОБНОВЛЕНИЕ ФАВИКОНА
 * Обновляет фавикон для конкретной закладки по её ID
 * Использует Google Favicon Service для получения более качественной иконки
 * Возвращает результат с информацией об успешности операции
 */
export async function updateBookmarkFavicon(bookmarkId) {
  try {
    // Получаем все закладки
    const bookmarks = await getStoredBookmarks()

    // Функция для поиска закладки по ID
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

    // Получение фавикона через Google
    let faviconUrl = await getGoogleFavicon(found.item.url)

    // Если фавикон не получен, возвращаем стандартный логотип
    if (!faviconUrl) {
      try {
        const baseUrl = chrome.runtime.getURL("/")
        faviconUrl = `${baseUrl}assets/icons/link.svg`
      } catch (e) {
        faviconUrl = "$EXTENSION_PATH$/assets/icons/link.svg"
      }
    }

    // Если фавикон не изменился, возвращаем результат без сохранения
    if (faviconUrl === found.item.favicon) {
      return {
        success: true,
        updated: false,
        url: found.item.url,
        title: found.item.title,
      }
    }

    // Обрабатываем специальный маркер для относительного пути
    let normalizedFaviconUrl = faviconUrl
    if (faviconUrl.startsWith("$EXTENSION_PATH$")) {
      try {
        const baseUrl = chrome.runtime.getURL("/")
        normalizedFaviconUrl = faviconUrl.replace("$EXTENSION_PATH$", baseUrl)
      } catch (e) {
        normalizedFaviconUrl = faviconUrl.replace("$EXTENSION_PATH$", "")
      }
    }

    // Обновляем фавикон в найденной закладке
    let current = bookmarks
    const pathSegments = found.path

    for (let i = 0; i < pathSegments.length - 1; i++) {
      const segment = pathSegments[i]

      if (segment === "children") {
        continue
      }

      current = current[segment]

      if (pathSegments[i + 1] === "children") {
        current = current.children
        i++
      }
    }

    const lastIndex = pathSegments[pathSegments.length - 1]
    current[lastIndex].favicon = normalizedFaviconUrl

    // Сохраняем изменения
    await saveBookmarks(bookmarks)

    return {
      success: true,
      updated: true,
      url: found.item.url,
      title: found.item.title,
      favicon: normalizedFaviconUrl,
    }
  } catch (error) {
    console.error("Ошибка при обновлении фавикона закладки:", error)
    return {
      success: false,
      error: error.message,
      defaultFavicon: "/assets/icons/link.svg",
    }
  }
}

/**
 * МАССОВОЕ ОБНОВЛЕНИЕ ФАВИКОНОВ
 * Обновляет фавиконы для всех закладок в хранилище
 * Поддерживает функцию обратного вызова для отображения прогресса
 * Обрабатывает закладки порциями для оптимизации производительности
 */
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

    // Обновляем все фавиконы параллельно с ограничением
    const BATCH_SIZE = 20
    const updatedBookmarks = [...bookmarks]

    // Функция для обновления одной закладки
    async function updateSingleFavicon(bookmarkInfo) {
      try {
        const { item, path } = bookmarkInfo

        // Используем быструю функцию для получения фавикона
        const faviconUrl = await getFaviconFast(item.url)

        // Если получили фавикон и он отличается от существующего
        if (faviconUrl && (!item.favicon || faviconUrl !== item.favicon)) {
          // Обновляем фавикон в нашей копии структуры
          let current = updatedBookmarks

          // Проходим по пути до нужной закладки
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
        return false
      } finally {
        processed++
        if (progressCallback) {
          progressCallback(processed, total, successfullyUpdated)
        }
      }
    }

    // Обрабатываем закладки порциями
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
  try {
    await storage.set("favicons_enabled", enabled)
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
    // По умолчанию выключено
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

// Добавляем в глобальное пространство для доступа из других модулей
if (typeof window !== "undefined") {
  window.getFavicon = getFavicon
}
