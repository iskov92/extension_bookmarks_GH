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

  // Создаем пункт контекстного меню
  createContextMenu()
})

// Функция для создания пункта контекстного меню
function createContextMenu() {
  // Сначала удаляем существующие пункты меню, чтобы избежать дублирования
  try {
    chrome.contextMenus.removeAll(() => {
      console.log("Существующие пункты контекстного меню удалены")

      // Создаем новый пункт меню
      chrome.contextMenus.create(
        {
          id: "addToBookmarkManager",
          title: "Добавить в менеджер закладок GH",
          contexts: ["page", "link"],
        },
        () => {
          const error = chrome.runtime.lastError
          if (error) {
            console.error("Ошибка создания контекстного меню:", error)
          } else {
            console.log("Пункт контекстного меню успешно создан")
          }
        }
      )
    })
  } catch (error) {
    console.error("Ошибка при управлении контекстным меню:", error)

    // Повторная попытка через таймаут
    setTimeout(createContextMenu, 1000)
  }
}

// Обрабатывает сообщения от popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background script получил сообщение:", request)

  // Обработка сообщения о загрузке content script
  if (request.action === "contentScriptLoaded") {
    console.log("Content script загружен на странице:", request.url)
    sendResponse({ status: "received" })
    return true
  }

  // Получение структуры папок для модального окна
  if (request.action === "getFolderStructure") {
    console.log("Получен запрос на получение структуры папок")
    chrome.storage.local.get("gh_bookmarks", (data) => {
      if (data.gh_bookmarks) {
        // Извлекаем только папки из дерева закладок
        const folders = extractFolders(data.gh_bookmarks.children || [])
        console.log("Структура папок:", folders)
        sendResponse({ success: true, folders: folders })
      } else {
        console.error("Не удалось получить закладки из хранилища")
        sendResponse({ success: false, error: "Не удалось получить закладки" })
      }
    })
    return true
  }

  // Сохранение закладки в выбранную папку
  if (request.action === "saveBookmark") {
    console.log("Получен запрос на сохранение закладки:", request.data)

    const { parentId, title, url } = request.data

    chrome.storage.local.get("gh_bookmarks", (data) => {
      if (!data.gh_bookmarks) {
        console.error("Не удалось получить закладки из хранилища")
        sendResponse({ success: false, error: "Не удалось получить закладки" })
        return
      }

      try {
        // Создаем новую закладку
        const newBookmark = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: title,
          url: url,
          type: "bookmark",
          icon: `https://www.google.com/s2/favicons?domain=${
            new URL(url).hostname
          }`,
          addedAt: new Date().toISOString(),
        }

        // Добавляем закладку в выбранную папку
        let bookmarks = data.gh_bookmarks

        if (parentId === "0") {
          // Добавляем в корневую папку
          bookmarks.children.push(newBookmark)
        } else {
          // Добавляем во вложенную папку
          const result = addBookmarkToFolder(
            bookmarks.children,
            parentId,
            newBookmark
          )
          if (!result.success) {
            console.error("Не удалось добавить закладку в папку:", result.error)
            sendResponse({ success: false, error: result.error })
            return
          }
        }

        // Сохраняем обновленные закладки
        chrome.storage.local.set({ gh_bookmarks: bookmarks }, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "Ошибка при сохранении закладок:",
              chrome.runtime.lastError
            )
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            })
          } else {
            console.log("Закладка успешно сохранена")
            sendResponse({ success: true, bookmark: newBookmark })
          }
        })
      } catch (error) {
        console.error("Ошибка при создании закладки:", error)
        sendResponse({ success: false, error: error.message })
      }
    })

    return true
  }

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

// Обработчик клика по пункту контекстного меню
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log("Обработчик клика по контекстному меню вызван", info, tab)

  if (info.menuItemId === "addToBookmarkManager") {
    console.log("Клик по пункту 'Добавить в менеджер закладок GH'")

    let url = info.linkUrl || tab.url
    let title = tab.title

    console.log("URL для добавления:", url)
    console.log("Заголовок для добавления:", title)

    // Если был клик по ссылке, получаем текст ссылки
    if (info.linkUrl) {
      console.log("Это клик по ссылке, запрашиваем текст ссылки")

      // В этом случае нам нужно получить текст ссылки из контента страницы
      chrome.tabs.sendMessage(
        tab.id,
        { action: "getLinkText", linkUrl: info.linkUrl },
        (response) => {
          const error = chrome.runtime.lastError
          if (error) {
            console.error(
              "Ошибка при отправке сообщения в content script:",
              error
            )
            // Продолжаем без текста ссылки
            showAddBookmarkModal(tab.id, url, title)
            return
          }

          console.log("Получен ответ от content script:", response)

          if (response && response.linkText) {
            title = response.linkText
            console.log("Обновленный заголовок:", title)
          }
          // Отправляем команду на отображение модального окна
          showAddBookmarkModal(tab.id, url, title)
        }
      )
    } else {
      console.log("Это клик по странице, используем заголовок страницы")
      // Отправляем команду на отображение модального окна напрямую
      showAddBookmarkModal(tab.id, url, title)
    }
  }
})

/**
 * Отправляет команду в content script для отображения модального окна добавления закладки
 * @param {number} tabId - ID вкладки
 * @param {string} url - URL закладки
 * @param {string} title - Заголовок закладки
 */
function showAddBookmarkModal(tabId, url, title) {
  // Проверяем, загружен ли content script
  chrome.tabs.sendMessage(tabId, { action: "ping" }, (response) => {
    const error = chrome.runtime.lastError
    if (error) {
      console.log("Content script не загружен, загружаем его")

      // Content script не загружен, внедряем его
      chrome.scripting.executeScript(
        {
          target: { tabId: tabId },
          files: ["src/content.js"],
        },
        () => {
          // После загрузки content script ждем немного и отправляем сообщение
          setTimeout(() => {
            sendShowModalMessage(tabId, url, title)
          }, 500) // Ждем 500 мс для полной инициализации скрипта
        }
      )
    } else {
      // Content script загружен, отправляем сообщение
      sendShowModalMessage(tabId, url, title)
    }
  })
}

/**
 * Отправляет сообщение в content script для отображения модального окна
 * @param {number} tabId - ID вкладки
 * @param {string} url - URL закладки
 * @param {string} title - Заголовок закладки
 */
function sendShowModalMessage(tabId, url, title) {
  chrome.tabs.sendMessage(
    tabId,
    {
      action: "showAddBookmarkModal",
      data: {
        url: url,
        title: title,
      },
    },
    (response) => {
      const error = chrome.runtime.lastError
      if (error) {
        console.error("Ошибка при отправке сообщения в content script:", error)
        // Открываем обычное окно расширения как запасной вариант
        chrome.windows.create({
          url: chrome.runtime.getURL(
            `src/popup.html?action=addBookmark&url=${encodeURIComponent(
              url
            )}&title=${encodeURIComponent(title)}`
          ),
          type: "popup",
          width: 800,
          height: 600,
        })
      } else {
        console.log("Модальное окно успешно отображено")
      }
    }
  )
}

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

// Регистрируем обработчик запуска расширения для создания контекстного меню
chrome.runtime.onStartup.addListener(() => {
  console.log("Расширение запущено, создаем контекстное меню")
  createContextMenu()
})

/**
 * Извлекает только папки из дерева закладок
 * @param {Array} items - Массив элементов закладок
 * @returns {Array} - Массив папок
 */
function extractFolders(items) {
  const folders = []

  for (const item of items) {
    if (item.type === "folder") {
      // Создаем копию папки без лишних данных
      const folder = {
        id: item.id,
        title: item.title,
        icon: item.icon || null,
        type: "folder",
      }

      // Если есть дочерние элементы, рекурсивно извлекаем папки
      if (item.children && item.children.length > 0) {
        folder.children = extractFolders(item.children)
      } else {
        folder.children = []
      }

      folders.push(folder)
    }
  }

  return folders
}

/**
 * Добавляет закладку в указанную папку
 * @param {Array} items - Массив элементов для поиска папки
 * @param {string} folderId - ID папки, в которую нужно добавить закладку
 * @param {Object} bookmark - Объект закладки для добавления
 * @returns {Object} - Результат операции
 */
function addBookmarkToFolder(items, folderId, bookmark) {
  for (const item of items) {
    if (item.id === folderId && item.type === "folder") {
      // Нашли нужную папку
      if (!item.children) {
        item.children = []
      }

      item.children.push(bookmark)
      return { success: true }
    }

    // Рекурсивный поиск в дочерних элементах
    if (item.children && item.children.length > 0) {
      const result = addBookmarkToFolder(item.children, folderId, bookmark)
      if (result.success) {
        return result
      }
    }
  }

  return { success: false, error: "Папка не найдена" }
}
