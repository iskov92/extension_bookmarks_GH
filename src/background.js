// Обработка установки расширения
chrome.runtime.onInstalled.addListener(async () => {
  // Инициализация настроек по умолчанию
  chrome.storage.sync.set({
    isDarkTheme: true, // Темная тема по умолчанию
  })

  // Проверяем, есть ли уже закладки
  const data = await chrome.storage.local.get("gh_bookmarks")
  if (!data.gh_bookmarks) {
    // Создаем базовую структуру папок
    const defaultBookmarks = {
      id: "0",
      title: "root",
      children: [
        {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: "Избранное",
          type: "folder",
          children: [],
        },
        {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: "Работа",
          type: "folder",
          children: [],
        },
        {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: "Личное",
          type: "folder",
          children: [],
        },
      ],
    }

    await chrome.storage.local.set({ gh_bookmarks: defaultBookmarks })
  }
})

// Обрабатывает сообщения от popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background script получил сообщение:", request)

  // Обработка запроса на получение HTML страницы
  if (request.action === "getHtmlContent") {
    fetchHtmlContent(request.url)
      .then((htmlContent) => {
        sendResponse({ success: true, htmlContent })
      })
      .catch((error) => {
        console.error("Ошибка при получении HTML:", error)
        sendResponse({ success: false, error: error.message })
      })

    return true // Указывает, что ответ будет отправлен асинхронно
  }

  // Обработка запроса на извлечение фавиконов из HTML
  if (request.action === "extractFavicons") {
    const favicons = extractFaviconsFromHTML(request.html, request.baseUrl)
    sendResponse({ success: true, favicons })
    return true
  }

  // Оригинальный обработчик экспорта закладок
  if (request.type === "EXPORT_BOOKMARKS") {
    chrome.storage.local.get("gh_bookmarks", (data) => {
      sendResponse({ bookmarks: data.gh_bookmarks?.children || [] })
    })
    return true // Для асинхронного ответа
  }

  // Новый обработчик экспорта закладок
  if (request.action === "exportBookmarks") {
    try {
      chrome.downloads.download({
        url: request.dataUrl,
        filename: "bookmarks_export.html",
        saveAs: true,
      })
      sendResponse({ success: true })
    } catch (error) {
      console.error("Ошибка при экспорте закладок:", error)
      sendResponse({ success: false, error: error.message })
    }
    return true
  }

  // Обработка запроса на проверку конкретных путей фавиконов
  if (request.action === "checkFaviconPaths") {
    checkFaviconPaths(request.url, request.paths)
      .then((results) => {
        sendResponse({ success: true, results })
      })
      .catch((error) => {
        console.error("Ошибка при проверке путей фавиконов:", error)
        sendResponse({ success: false, error: error.message })
      })

    return true
  }

  // Если не найден обработчик, возвращаем ошибку
  sendResponse({ success: false, error: "Неизвестное действие" })
  return true
})

// Функция для получения HTML содержимого страницы
async function fetchHtmlContent(url) {
  try {
    console.log(`Получение HTML содержимого для ${url}`)
    const response = await fetch(url, {
      cache: "no-cache",
      headers: {
        Accept: "text/html",
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }

    return await response.text()
  } catch (error) {
    console.error(`Ошибка при получении HTML для ${url}:`, error)
    throw error
  }
}

// Функция для извлечения фавиконов из HTML
function extractFaviconsFromHTML(html, baseUrl) {
  try {
    const urlObj = new URL(baseUrl)

    // Создаем DOM-парсер для анализа HTML
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")

    // Ищем различные типы иконок в порядке приоритета
    const iconSelectors = [
      // Веб-стандартные иконки
      'link[rel="icon"][href]',
      'link[rel="shortcut icon"][href]',
      'link[rel="apple-touch-icon"][href]',
      'link[rel="apple-touch-icon-precomposed"][href]',
      // Специфические форматы
      'link[rel="icon"][type="image/svg+xml"][href]',
      'link[rel="icon"][type="image/png"][href]',
      'link[rel="icon"][type="image/x-icon"][href]',
      // Общие метатеги для соц. сетей и превью
      'meta[property="og:image"][content]',
      'meta[name="twitter:image"][content]',
    ]

    const iconURLs = []

    // Проверяем все селекторы и собираем возможные URL иконок
    for (const selector of iconSelectors) {
      const elements = doc.querySelectorAll(selector)
      for (const element of elements) {
        let iconURL = selector.includes("meta")
          ? element.getAttribute("content")
          : element.getAttribute("href")

        // Обрабатываем относительные пути
        if (
          iconURL &&
          !iconURL.match(/^https?:\/\//i) &&
          !iconURL.startsWith("data:")
        ) {
          if (iconURL.startsWith("/")) {
            iconURL = `${urlObj.origin}${iconURL}`
          } else {
            // Обработка относительных путей без начального '/'
            const pathParts = urlObj.pathname.split("/")
            pathParts.pop() // Удаляем последний элемент (имя файла)
            const basePath = pathParts.join("/")
            iconURL = `${urlObj.origin}${basePath}/${iconURL}`
          }
        }

        if (iconURL) {
          iconURLs.push({
            url: iconURL,
            priority: iconSelectors.indexOf(selector) + 1, // Приоритет соответствует порядку в массиве
          })
        }
      }
    }

    // Сортируем по приоритету
    iconURLs.sort((a, b) => a.priority - b.priority)

    return iconURLs
  } catch (error) {
    console.error("Ошибка при извлечении фавиконов из HTML:", error)
    return []
  }
}

// Функция для проверки доступности конкретных путей фавиконов
async function checkFaviconPaths(baseUrl, paths) {
  const results = []
  const urlObj = new URL(baseUrl)

  for (const path of paths) {
    try {
      const faviconUrl = path.startsWith("http")
        ? path
        : `${urlObj.origin}${path}`
      console.log(`Проверка фавикона по адресу: ${faviconUrl}`)

      // Используем HEAD запрос для проверки доступности
      const response = await fetch(faviconUrl, {
        method: "HEAD",
        cache: "no-cache",
      })

      if (response.ok) {
        results.push({
          url: faviconUrl,
          exists: true,
          contentType: response.headers.get("content-type"),
        })
      } else {
        results.push({
          url: faviconUrl,
          exists: false,
          status: response.status,
        })
      }
    } catch (error) {
      console.warn(`Ошибка при проверке пути ${path}:`, error)
      results.push({
        url: path.startsWith("http") ? path : `${urlObj.origin}${path}`,
        exists: false,
        error: error.message,
      })
    }
  }

  return results
}
