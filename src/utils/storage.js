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
 * Проверяет стандартные пути для фавиконов на сайте
 * @param {string} baseUrl - Базовый URL сайта (домен с протоколом)
 * @returns {Promise<string|null>} - URL найденного фавикона или null
 */
async function checkStandardFaviconPaths(baseUrl) {
  console.log(
    `[ФавиконЛог] checkStandardFaviconPaths: Проверяем стандартные пути для ${baseUrl}`
  )

  // Список стандартных путей для фавиконов в порядке предпочтения
  const standardPaths = [
    "/apple-touch-icon.png",
    "/apple-touch-icon-precomposed.png",
    "/favicon-32x32.png",
    "/favicon-16x16.png",
    "/favicon.png",
    "/favicon.ico",
  ]

  // Создаем массив полных URL для проверки
  const urlsToCheck = standardPaths.map((path) => `${baseUrl}${path}`)

  // Проверяем каждый URL на доступность
  for (const faviconUrl of urlsToCheck) {
    console.log(
      `[ФавиконЛог] Проверяем стандартный путь фавикона: ${faviconUrl}`
    )

    try {
      // Пробуем отправить HEAD-запрос через background.js
      const isAvailable = await checkFaviconAvailability(faviconUrl)

      if (isAvailable) {
        console.log(
          `[ФавиконЛог] Найден фавикон по стандартному пути: ${faviconUrl}`
        )
        return faviconUrl
      }
    } catch (error) {
      console.log(
        `[ФавиконЛог] Ошибка при проверке пути ${faviconUrl}: ${error.message}`
      )
    }
  }

  console.log(
    `[ФавиконЛог] Не найдено фавиконов по стандартным путям для ${baseUrl}`
  )
  return null
}

/**
 * Проверяет доступность фавикона с помощью HEAD-запроса
 * @param {string} url - URL для проверки
 * @returns {Promise<boolean>} - true если фавикон доступен
 */
async function checkFaviconAvailability(url) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: "checkFaviconAvailability",
        url: url,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            `[ФавиконЛог] Ошибка при проверке фавикона: ${chrome.runtime.lastError.message}`
          )
          resolve(false)
          return
        }

        if (response && response.success) {
          resolve(true)
        } else {
          resolve(false)
        }
      }
    )

    // Устанавливаем таймаут на случай, если ответ не придет
    setTimeout(() => {
      console.log(
        `[ФавиконЛог] Таймаут при проверке доступности фавикона: ${url}`
      )
      resolve(false)
    }, 1500)
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
 * с проверкой на заглушку и возможностью получения фавикона из HTML
 */
export async function getGoogleFavicon(url) {
  try {
    console.log(`[ФавиконЛог] Начинаем получение фавикона для URL: ${url}`)

    if (!url) {
      console.log(`[ФавиконЛог] URL не указан, возвращаем стандартную иконку`)
      return "/assets/icons/link.svg"
    }

    // Проверка URL
    let urlObj
    try {
      urlObj = new URL(url)

      // Используем только основной URL (домен с протоколом)
      const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`
      console.log(
        `[ФавиконЛог] URL корректный: ${url}, используем основной URL: ${baseUrl}`
      )

      // Переопределяем URL для дальнейшего использования
      url = baseUrl
      urlObj = new URL(url)
    } catch (e) {
      console.log(`[ФавиконЛог] Некорректный URL: ${url}, ошибка: ${e.message}`)
      return "/assets/icons/link.svg"
    }

    const domain = urlObj.hostname

    // Создаем URL для Google Favicon Service
    const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
    console.log(
      `[ФавиконЛог] Пробуем получить фавикон через Google: ${googleFaviconUrl}`
    )

    // Проверяем, не является ли полученный фавикон заглушкой
    console.log(`[ФавиконЛог] Проверяем, не является ли фавикон заглушкой...`)
    const isDefaultIcon = await checkIfDefaultIcon(googleFaviconUrl)
    console.log(
      `[ФавиконЛог] Результат проверки: ${
        isDefaultIcon ? "это заглушка" : "это НЕ заглушка"
      }`
    )

    // Если это не заглушка, возвращаем фавикон от Google
    if (!isDefaultIcon) {
      console.log(
        `[ФавиконЛог] Используем фавикон от Google: ${googleFaviconUrl}`
      )
      return googleFaviconUrl
    }

    // Если Google вернул заглушку, пробуем получить фавикон из HTML
    console.log(`[ФавиконЛог] Пробуем получить фавикон из HTML страницы...`)
    const htmlFaviconUrl = await getFaviconFromHtml(url)

    if (htmlFaviconUrl) {
      console.log(
        `[ФавиконЛог] Успешно получен фавикон из HTML: ${htmlFaviconUrl}`
      )
      return htmlFaviconUrl
    } else {
      console.log(`[ФавиконЛог] Не удалось получить фавикон из HTML`)
    }

    // Если HTML не сработал, пробуем найти фавикон по стандартным путям
    console.log(`[ФавиконЛог] Пробуем найти фавикон по стандартным путям...`)
    const standardFaviconUrl = await checkStandardFaviconPaths(url)

    if (standardFaviconUrl) {
      console.log(
        `[ФавиконЛог] Успешно найден фавикон по стандартному пути: ${standardFaviconUrl}`
      )
      return standardFaviconUrl
    }

    console.log(`[ФавиконЛог] Стандартные пути не дали результата`)

    // Если не удалось получить фавикон, возвращаем стандартный логотип
    console.log(`[ФавиконЛог] Используем стандартную иконку`)
    try {
      const baseUrl = chrome.runtime.getURL("/")
      const defaultIcon = `${baseUrl}assets/icons/link.svg`
      console.log(`[ФавиконЛог] Стандартная иконка: ${defaultIcon}`)
      return defaultIcon
    } catch (e) {
      // Если не удалось получить URL расширения, используем специальный маркер
      console.log(
        `[ФавиконЛог] Не удалось получить URL расширения: ${e.message}`
      )
      return "$EXTENSION_PATH$/assets/icons/link.svg"
    }
  } catch (error) {
    console.error(`[ФавиконЛог] Ошибка при получении фавикона:`, error)
    return "$EXTENSION_PATH$/assets/icons/link.svg"
  }
}

/**
 * Проверяет, является ли фавикон заглушкой от Google
 * @param {string} faviconUrl - URL фавикона
 * @returns {Promise<boolean>} - true, если это заглушка
 */
async function checkIfDefaultIcon(faviconUrl) {
  console.log(
    `[ФавиконЛог] checkIfDefaultIcon: Начинаем проверку для ${faviconUrl}`
  )
  return new Promise((resolve) => {
    const img = new Image()

    img.onload = function () {
      console.log(
        `[ФавиконЛог] checkIfDefaultIcon: Изображение загружено, размеры ${img.width}x${img.height}`
      )
      // Проверяем размеры (заглушки обычно 16x16 или 24x24)
      if (
        (img.width === 16 && img.height === 16) ||
        (img.width === 24 && img.height === 24)
      ) {
        console.log(
          `[ФавиконЛог] checkIfDefaultIcon: Размер соответствует заглушке`
        )
        resolve(true)
      } else {
        console.log(
          `[ФавиконЛог] checkIfDefaultIcon: Размер НЕ соответствует заглушке`
        )
        resolve(false)
      }
    }

    img.onerror = function () {
      console.log(
        `[ФавиконЛог] checkIfDefaultIcon: Ошибка загрузки изображения`
      )
      resolve(true) // В случае ошибки считаем заглушкой
    }

    // Добавляем случайный параметр для предотвращения кэширования
    img.src = `${faviconUrl}?nocache=${Date.now()}`
    console.log(
      `[ФавиконЛог] checkIfDefaultIcon: Начата загрузка изображения с ${img.src}`
    )

    // Устанавливаем таймаут, чтобы не ждать слишком долго
    setTimeout(() => {
      console.log(
        `[ФавиконЛог] checkIfDefaultIcon: Сработал таймаут, считаем заглушкой`
      )
      resolve(true)
    }, 1000)
  })
}

/**
 * Получает фавикон из HTML страницы
 * @param {string} url - URL страницы
 * @returns {Promise<string|null>} - URL фавикона или null
 */
async function getFaviconFromHtml(url) {
  console.log(
    `[ФавиконЛог] getFaviconFromHtml: Начинаем получение HTML для ${url}`
  )
  try {
    // Используем существующий обработчик в background.js для обхода CORS
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        console.log(`[ФавиконЛог] getFaviconFromHtml: Сработал таймаут`)
        resolve(null)
      }, 3000) // 3 секунды таймаут

      console.log(
        `[ФавиконЛог] getFaviconFromHtml: Отправляем запрос в background.js`
      )
      chrome.runtime.sendMessage(
        {
          action: "getHtmlContent",
          url: url,
        },
        async (response) => {
          clearTimeout(timeoutId)

          console.log(
            `[ФавиконЛог] getFaviconFromHtml: Получен ответ от background.js:`,
            response
              ? `${typeof response} ${JSON.stringify(response).substring(
                  0,
                  100
                )}...`
              : "null"
          )

          if (chrome.runtime.lastError) {
            console.error(
              `[ФавиконЛог] getFaviconFromHtml: Ошибка runtime при получении ответа:`,
              chrome.runtime.lastError
            )
            resolve(null)
            return
          }

          if (!response) {
            console.log(
              `[ФавиконЛог] getFaviconFromHtml: Пустой ответ от background.js`
            )
            resolve(null)
            return
          }

          if (!response.success) {
            console.log(
              `[ФавиконЛог] getFaviconFromHtml: Ошибка в ответе: ${
                response.error || "неизвестная ошибка"
              }`
            )
            resolve(null)
            return
          }

          if (!response.htmlContent) {
            console.log(
              `[ФавиконЛог] getFaviconFromHtml: Отсутствует HTML в ответе`
            )
            resolve(null)
            return
          }

          console.log(
            `[ФавиконЛог] getFaviconFromHtml: Получен HTML, размер: ${response.htmlContent.length} байт`
          )

          try {
            // Создаем URL-объект для базового URL сайта
            const baseUrl = new URL(url)
            console.log(
              `[ФавиконЛог] getFaviconFromHtml: Базовый URL сайта: ${baseUrl.href}`
            )

            // Парсим HTML и ищем фавиконы
            const parser = new DOMParser()
            const doc = parser.parseFromString(
              response.htmlContent,
              "text/html"
            )
            console.log(
              `[ФавиконЛог] getFaviconFromHtml: HTML успешно распарсен`
            )

            // Массив найденных фавиконов для проверки
            const foundFavicons = []

            // 1. SVG иконки (обычно лучшего качества)
            const svgIcon = doc.querySelector(
              'link[rel="icon"][type="image/svg+xml"], link[rel="icon"][href$=".svg"]'
            )
            if (svgIcon && svgIcon.href) {
              try {
                // Создаем абсолютный URL, используя origin сайта
                const iconHref = svgIcon.getAttribute("href")
                let fullUrl

                // Проверяем, является ли путь абсолютным URL
                if (
                  iconHref.startsWith("http://") ||
                  iconHref.startsWith("https://")
                ) {
                  fullUrl = iconHref
                } else if (iconHref.startsWith("//")) {
                  // Протокол-относительный URL
                  fullUrl = baseUrl.protocol + iconHref
                } else if (iconHref.startsWith("/")) {
                  // Абсолютный путь относительно корня сайта
                  fullUrl = baseUrl.origin + iconHref
                } else {
                  // Относительный путь
                  const pathWithoutFile =
                    baseUrl.pathname.split("/").slice(0, -1).join("/") + "/"
                  fullUrl = baseUrl.origin + pathWithoutFile + iconHref
                }

                console.log(
                  `[ФавиконЛог] getFaviconFromHtml: Найдена SVG иконка: ${fullUrl}, оригинальный путь: ${iconHref}`
                )

                foundFavicons.push({
                  type: "svg",
                  url: fullUrl,
                  priority: 1, // Наивысший приоритет
                })
              } catch (e) {
                console.log(
                  `[ФавиконЛог] getFaviconFromHtml: Ошибка обработки SVG иконки:`,
                  e
                )
              }
            }

            // 2. Apple Touch Icon (часто высокого качества)
            const appleIcon = doc.querySelector(
              'link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
            )
            if (appleIcon && appleIcon.href) {
              try {
                // Создаем абсолютный URL, используя origin сайта
                const iconHref = appleIcon.getAttribute("href")
                let fullUrl

                // Проверяем, является ли путь абсолютным URL
                if (
                  iconHref.startsWith("http://") ||
                  iconHref.startsWith("https://")
                ) {
                  fullUrl = iconHref
                } else if (iconHref.startsWith("//")) {
                  // Протокол-относительный URL
                  fullUrl = baseUrl.protocol + iconHref
                } else if (iconHref.startsWith("/")) {
                  // Абсолютный путь относительно корня сайта
                  fullUrl = baseUrl.origin + iconHref
                } else {
                  // Относительный путь
                  const pathWithoutFile =
                    baseUrl.pathname.split("/").slice(0, -1).join("/") + "/"
                  fullUrl = baseUrl.origin + pathWithoutFile + iconHref
                }

                console.log(
                  `[ФавиконЛог] getFaviconFromHtml: Найдена Apple Touch Icon: ${fullUrl}, оригинальный путь: ${iconHref}`
                )

                foundFavicons.push({
                  type: "appleTouch",
                  url: fullUrl,
                  priority: 2, // Высокий приоритет
                })
              } catch (e) {
                console.log(
                  `[ФавиконЛог] getFaviconFromHtml: Ошибка обработки Apple Touch Icon:`,
                  e
                )
              }
            }

            // 3. Обычные иконки
            const standardIcons = doc.querySelectorAll(
              'link[rel="icon"], link[rel="shortcut icon"], link[rel="Shortcut Icon"]'
            )

            if (standardIcons && standardIcons.length > 0) {
              for (const standardIcon of standardIcons) {
                if (standardIcon.href) {
                  try {
                    // Создаем абсолютный URL, используя origin сайта
                    const iconHref = standardIcon.getAttribute("href")
                    let fullUrl

                    // Проверяем, является ли путь абсолютным URL
                    if (
                      iconHref.startsWith("http://") ||
                      iconHref.startsWith("https://")
                    ) {
                      fullUrl = iconHref
                    } else if (iconHref.startsWith("//")) {
                      // Протокол-относительный URL
                      fullUrl = baseUrl.protocol + iconHref
                    } else if (iconHref.startsWith("/")) {
                      // Абсолютный путь относительно корня сайта
                      fullUrl = baseUrl.origin + iconHref
                    } else {
                      // Относительный путь
                      const pathWithoutFile =
                        baseUrl.pathname.split("/").slice(0, -1).join("/") + "/"
                      fullUrl = baseUrl.origin + pathWithoutFile + iconHref
                    }

                    console.log(
                      `[ФавиконЛог] getFaviconFromHtml: Найдена стандартная иконка: ${fullUrl}, оригинальный путь: ${iconHref}`
                    )

                    // Определяем приоритет в зависимости от типа
                    let priority = 3 // Базовый приоритет для обычных иконок

                    // Если это SVG, повышаем приоритет
                    if (iconHref.endsWith(".svg")) {
                      priority = 1.5
                    }
                    // Если это PNG или ICO, используем небольшой приоритет
                    else if (iconHref.endsWith(".png")) {
                      priority = 2.5
                    } else if (iconHref.endsWith(".ico")) {
                      priority = 3.5
                    }

                    foundFavicons.push({
                      type: "standard",
                      url: fullUrl,
                      priority: priority,
                    })
                  } catch (e) {
                    console.log(
                      `[ФавиконЛог] getFaviconFromHtml: Ошибка обработки стандартной иконки:`,
                      e
                    )
                  }
                }
              }
            }

            // 4. Добавляем стандартный путь к favicon.ico как запасной вариант
            const defaultFaviconUrl = `${baseUrl.origin}/favicon.ico`
            foundFavicons.push({
              type: "default",
              url: defaultFaviconUrl,
              priority: 4, // Самый низкий приоритет
            })

            // Если нашли какие-то фавиконы, сортируем их по приоритету и проверяем доступность
            if (foundFavicons.length > 0) {
              // Сортируем по приоритету (от меньшего к большему - чем меньше число, тем выше приоритет)
              foundFavicons.sort((a, b) => a.priority - b.priority)

              console.log(
                `[ФавиконЛог] getFaviconFromHtml: Найдено ${foundFavicons.length} фавиконов для проверки`
              )

              // Проверяем каждый фавикон на доступность
              for (const favicon of foundFavicons) {
                console.log(
                  `[ФавиконЛог] getFaviconFromHtml: Проверяем доступность фавикона: ${favicon.url}`
                )

                // Проверяем доступность через background.js
                const isAvailable = await checkFaviconAvailability(favicon.url)

                if (isAvailable) {
                  console.log(
                    `[ФавиконЛог] getFaviconFromHtml: Фавикон доступен и будет использован: ${favicon.url}`
                  )
                  resolve(favicon.url)
                  return
                } else {
                  console.log(
                    `[ФавиконЛог] getFaviconFromHtml: Фавикон недоступен: ${favicon.url}`
                  )
                }
              }

              console.log(
                `[ФавиконЛог] getFaviconFromHtml: Ни один из найденных фавиконов не доступен`
              )
            }

            console.log(
              `[ФавиконЛог] getFaviconFromHtml: Не найдено доступных иконок, возвращаем null`
            )
            resolve(null)
          } catch (error) {
            console.error(
              `[ФавиконЛог] getFaviconFromHtml: Ошибка при обработке HTML:`,
              error
            )
            resolve(null)
          }
        }
      )
    })
  } catch (error) {
    console.error(`[ФавиконЛог] getFaviconFromHtml: Ошибка:`, error)
    return null
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
    console.log(
      `[ФавиконЛог] Начинаем обновление фавикона для закладки: ${bookmarkId}`
    )

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
      console.log(
        `[ФавиконЛог] Закладка не найдена или не имеет URL: ${bookmarkId}`
      )
      return {
        success: false,
        error: "Закладка не найдена или не имеет URL",
      }
    }

    console.log(
      `[ФавиконЛог] Найдена закладка: ID=${found.item.id}, URL=${found.item.url}, Title=${found.item.title}`
    )

    // Запоминаем старый фавикон для информации
    const oldFavicon = found.item.favicon || ""
    console.log(`[ФавиконЛог] Текущий фавикон закладки: ${oldFavicon}`)

    // Получение фавикона через Google
    let faviconUrl = await getGoogleFavicon(found.item.url)

    // Если фавикон не получен, возвращаем стандартный логотип
    if (!faviconUrl) {
      try {
        const baseUrl = chrome.runtime.getURL("/")
        faviconUrl = `${baseUrl}assets/icons/link.svg`
        console.log(
          `[ФавиконЛог] Не удалось получить фавикон, используем стандартный: ${faviconUrl}`
        )
      } catch (e) {
        faviconUrl = "$EXTENSION_PATH$/assets/icons/link.svg"
        console.log(
          `[ФавиконЛог] Ошибка при получении стандартного фавикона: ${e.message}`
        )
      }
    }

    // Обрабатываем специальный маркер для относительного пути
    let normalizedFaviconUrl = faviconUrl
    if (faviconUrl.startsWith("$EXTENSION_PATH$")) {
      try {
        const baseUrl = chrome.runtime.getURL("/")
        normalizedFaviconUrl = faviconUrl.replace("$EXTENSION_PATH$", baseUrl)
        console.log(
          `[ФавиконЛог] Нормализован URL фавикона: ${normalizedFaviconUrl}`
        )
      } catch (e) {
        normalizedFaviconUrl = faviconUrl.replace("$EXTENSION_PATH$", "")
        console.log(
          `[ФавиконЛог] Ошибка при нормализации URL фавикона: ${e.message}`
        )
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
    console.log(
      `[ФавиконЛог] Обновлен фавикон для закладки: ${found.item.title}, новый фавикон: ${normalizedFaviconUrl}`
    )

    if (oldFavicon === normalizedFaviconUrl) {
      console.log(
        `[ФавиконЛог] Информация: новый фавикон совпадает с предыдущим, но всё равно обновляем`
      )
    }

    // Сохраняем изменения
    await saveBookmarks(bookmarks)
    console.log(
      `[ФавиконЛог] Структура закладок с обновленным фавиконом сохранена`
    )

    return {
      success: true,
      updated: true, // Всегда считаем обновленным при ручном обновлении
      url: found.item.url,
      title: found.item.title,
      favicon: normalizedFaviconUrl,
      previousFavicon: oldFavicon, // Добавляем информацию о предыдущем фавиконе
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
