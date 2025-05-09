/**
 * Функция fetch с ограничением времени ожидания
 * @param {string} url - URL для запроса
 * @param {Object} options - Опции для fetch
 * @returns {Promise} - Promise с результатом fetch
 */
function fetchWithTimeout(url, options = {}) {
  const { timeout = 5000, ...fetchOptions } = options

  return new Promise((resolve, reject) => {
    // Устанавливаем таймаут
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      console.log(`[Background] fetchWithTimeout: Сработал таймаут для ${url}`)
      controller.abort()
    }, timeout)

    // Выполняем fetch с AbortController
    fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    })
      .then((response) => {
        clearTimeout(timeoutId)
        resolve(response)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        console.error(
          `[Background] fetchWithTimeout: Ошибка при запросе ${url}:`,
          error.message
        )
        reject(error)
      })
  })
}

// Обработка установки расширения
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Background] Расширение установлено или обновлено")

  // Инициализация настроек по умолчанию
  chrome.storage.sync.set({
    isDarkTheme: true, // Темная тема по умолчанию
  })

  // Инициализируем структуру закладок, если её нет
  try {
    const data = await new Promise((resolve) =>
      chrome.storage.local.get("gh_bookmarks", resolve)
    )

    if (!data || !data.gh_bookmarks) {
      console.log(
        "[Background] При установке: закладки не обнаружены, создаем базовую структуру"
      )
      await forceInitializeBookmarks()
    } else {
      // Проверяем структуру на наличие проблем
      console.log("[Background] При установке: проверяем структуру закладок")
      await fixBookmarksStructure()
    }
  } catch (error) {
    console.error("[Background] Ошибка при инициализации закладок:", error)
    // При ошибке создаем новую структуру
    await forceInitializeBookmarks()
  }

  // Создаем пункт контекстного меню
  createContextMenu()
})

// Функция для создания пункта контекстного меню
function createContextMenu() {
  // Сначала удаляем существующие пункты меню, чтобы избежать дублирования
  try {
    chrome.contextMenus.removeAll(() => {
      console.log("[Background] Существующие пункты контекстного меню удалены")

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
            console.error(
              "[Background] Ошибка создания контекстного меню:",
              error
            )
          } else {
            console.log("[Background] Пункт контекстного меню успешно создан")
          }
        }
      )
    })
  } catch (error) {
    console.error("[Background] Ошибка при управлении контекстным меню:", error)

    // Повторная попытка через таймаут
    setTimeout(createContextMenu, 1000)
  }
}

// Обработчик клика по контекстному меню
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log("[Background] Клик по контекстному меню:", info, tab)

  if (info.menuItemId === "addToBookmarkManager") {
    console.log("[Background] Выбран пункт 'Добавить в менеджер закладок GH'")

    // Определяем URL и заголовок для закладки
    let url = info.linkUrl || info.pageUrl
    let title = ""

    if (info.linkUrl) {
      // Если был клик по ссылке, получаем текст ссылки через content script
      console.log("[Background] Клик по ссылке:", info.linkUrl)

      chrome.tabs.sendMessage(
        tab.id,
        {
          action: "getLinkText",
          linkUrl: info.linkUrl,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "[Background] Ошибка при получении текста ссылки:",
              chrome.runtime.lastError
            )
            // Используем URL в качестве заголовка, если не удалось получить текст ссылки
            showAddBookmarkModal(tab.id, url, url)
            return
          }

          if (response && response.success && response.linkText) {
            console.log("[Background] Получен текст ссылки:", response.linkText)
            showAddBookmarkModal(tab.id, url, response.linkText)
          } else {
            console.warn(
              "[Background] Не удалось получить текст ссылки, используем URL"
            )
            showAddBookmarkModal(tab.id, url, url)
          }
        }
      )
    } else {
      // Если клик по странице, используем её заголовок
      console.log("[Background] Клик по странице:", tab.url, tab.title)
      showAddBookmarkModal(tab.id, tab.url, tab.title)
    }
  }
})

/**
 * Отображает модальное окно добавления закладки
 * @param {number} tabId - ID вкладки
 * @param {string} url - URL для закладки
 * @param {string} title - Заголовок для закладки
 */
async function showAddBookmarkModal(tabId, url, title) {
  console.log("[Background] Отображаем модальное окно добавления закладки:", {
    tabId,
    url,
    title,
  })

  // Проверяем, загружен ли content script
  try {
    // Используем chrome.tabs.sendMessage с обработкой ошибки подключения
    const checkContentScript = async () => {
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: "ping" }, (response) => {
          // Если возникла ошибка подключения, просто возвращаем false
          // вместо генерации исключения
          if (chrome.runtime.lastError) {
            console.log(
              "[Background] Content script еще не загружен, будем инжектировать"
            )
            resolve(false)
            return
          }

          // Проверяем корректность ответа
          if (response && response.status === "content_script_active") {
            console.log(
              "[Background] Content script активен, отправляем команду на отображение модального окна"
            )
            resolve(true)
          } else {
            console.log(
              "[Background] Получен некорректный ответ от content script, будем переинжектировать"
            )
            resolve(false)
          }
        })
      })
    }

    // Проверяем статус content script
    const isContentScriptActive = await checkContentScript()

    if (isContentScriptActive) {
      sendShowModalMessage(tabId, url, title)
    } else {
      injectContentScriptAndShowModal(tabId, url, title)
    }
  } catch (error) {
    console.error("[Background] Ошибка при работе с content script:", error)
    injectContentScriptAndShowModal(tabId, url, title)
  }
}

/**
 * Инжектирует content script и показывает модальное окно
 * @param {number} tabId - ID вкладки
 * @param {string} url - URL для закладки
 * @param {string} title - Заголовок для закладки
 */
async function injectContentScriptAndShowModal(tabId, url, title) {
  console.log("[Background] Инжектируем content script в вкладку:", tabId)

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["src/content.js"],
    })

    console.log("[Background] Content script успешно инжектирован")

    // Даем небольшую задержку для инициализации script
    setTimeout(() => {
      sendShowModalMessage(tabId, url, title)
    }, 500)
  } catch (error) {
    console.error(
      "[Background] Ошибка при инжектировании content script:",
      error
    )
    alert(
      "Не удалось отобразить модальное окно. Пожалуйста, откройте расширение напрямую."
    )
  }
}

/**
 * Отправляет сообщение для отображения модального окна
 * @param {number} tabId - ID вкладки
 * @param {string} url - URL для закладки
 * @param {string} title - Заголовок для закладки
 */
function sendShowModalMessage(tabId, url, title) {
  console.log(
    "[Background] Отправляем сообщение на отображение модального окна"
  )

  chrome.tabs.sendMessage(
    tabId,
    {
      action: "showAddBookmarkModal",
      data: { url, title },
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[Background] Ошибка при отправке сообщения:",
          chrome.runtime.lastError
        )
        alert(
          "Не удалось отобразить модальное окно. Пожалуйста, откройте расширение напрямую."
        )
        return
      }

      console.log(
        "[Background] Ответ на отображение модального окна:",
        response
      )
    }
  )
}

// Обрабатывает сообщения от popup и content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Получено сообщение:", message)

  // Обработка запросов на получение HTML содержимого для извлечения фавикона
  if (message.action === "getHtmlContent") {
    console.log("[Background] Запрос на получение HTML страницы:", message.url)

    // Используем функцию fetchWithTimeout для ограничения времени ожидания
    fetchWithTimeout(message.url, {
      method: "GET",
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; BookmarkExtension/1.0)",
      },
      timeout: 3000, // 3 секунды таймаут
    })
      .then((response) => {
        if (!response.ok) {
          console.log(
            `[Background] HTTP ошибка при получении HTML: ${response.status}, ${response.statusText}`
          )
          throw new Error(`HTTP error: ${response.status}`)
        }
        return response.text()
      })
      .then((html) => {
        console.log(`[Background] Успешно получен HTML (${html.length} байт)`)
        sendResponse({ success: true, htmlContent: html })
      })
      .catch((error) => {
        console.error("[Background] Ошибка при получении HTML:", error.message)
        sendResponse({ success: false, error: error.message })
      })

    // Возвращаем true для указания, что sendResponse будет вызван асинхронно
    return true
  }

  // Обработка запросов на проверку существования фавиконов по известным путям
  if (
    message.action === "checkFaviconPaths" &&
    message.url &&
    Array.isArray(message.paths)
  ) {
    console.log(
      "[Background] Проверка известных путей фавиконов для:",
      message.url
    )

    const results = []
    let completedChecks = 0

    // Проверяем каждый путь на существование
    message.paths.forEach((path) => {
      const fullUrl = message.url + path

      fetch(fullUrl, { method: "HEAD", mode: "no-cors" })
        .then((response) => {
          results.push({
            path: path,
            url: fullUrl,
            exists: response.ok,
            status: response.status,
          })
        })
        .catch(() => {
          results.push({ path: path, url: fullUrl, exists: false })
        })
        .finally(() => {
          completedChecks++

          // Когда все проверки завершены, отправляем ответ
          if (completedChecks === message.paths.length) {
            sendResponse({ success: true, results })
          }
        })
    })

    return true
  }

  // Обработка запроса на проверку доступности фавикона
  if (message.action === "checkFaviconAvailability" && message.url) {
    console.log("[Background] Проверка доступности фавикона:", message.url)

    // Используем HEAD запрос для проверки доступности
    fetchWithTimeout(message.url, {
      method: "HEAD",
      timeout: 1500,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BookmarkExtension/1.0)",
      },
    })
      .then((response) => {
        console.log(
          `[Background] Проверка фавикона ${message.url}: статус ${response.status}`
        )

        // Считаем успешными статусы 200-299
        const success = response.ok
        sendResponse({
          success: success,
          status: response.status,
        })
      })
      .catch((error) => {
        console.error(
          `[Background] Ошибка при проверке фавикона ${message.url}:`,
          error.message
        )
        sendResponse({
          success: false,
          error: error.message,
        })
      })

    return true
  }

  // Обработка тестового соединения
  if (message.action === "testConnection") {
    console.log("[Background] Получен тестовый запрос:", message.data)
    sendResponse({
      success: true,
      message: "Соединение работает",
      received: message.data,
      timestamp: Date.now(),
    })
    return true
  }

  // Добавим новый обработчик для полного сброса и пересоздания структуры
  if (message.action === "resetBookmarksStructure") {
    console.log(
      "[Background] Получен запрос на полный сброс структуры закладок"
    )

    // Полностью удаляем текущую структуру
    chrome.storage.local.remove("gh_bookmarks", async () => {
      console.log("[Background] Текущая структура закладок удалена")

      // Создаем новую базовую структуру
      await forceInitializeBookmarks()

      // Получаем свежесозданные данные для проверки
      chrome.storage.local.get("gh_bookmarks", (newData) => {
        if (newData && newData.gh_bookmarks && newData.gh_bookmarks.children) {
          console.log(
            "[Background] Новая структура создана успешно:",
            "id:",
            newData.gh_bookmarks.id,
            "children:",
            newData.gh_bookmarks.children.length
          )

          sendResponse({
            success: true,
            message: "Структура закладок полностью сброшена и пересоздана",
            structure: newData.gh_bookmarks,
          })
        } else {
          console.error(
            "[Background] Не удалось создать новую структуру закладок"
          )
          sendResponse({
            success: false,
            error: "Не удалось создать новую структуру закладок",
          })
        }
      })
    })

    return true
  }

  // Обработка сообщения о загрузке content script
  if (message.action === "contentScriptLoaded") {
    console.log(
      "[Background] Content script загружен на странице:",
      message.url
    )
    sendResponse({ status: "received" })
    return true
  }

  // Запрос на исправление структуры закладок
  if (message.action === "fixBookmarksStructure") {
    console.log("[Background] Получен запрос на исправление структуры закладок")

    try {
      // Получаем данные из хранилища для проверки
      chrome.storage.local.get("gh_bookmarks", async (data) => {
        console.log(
          "[Background] Данные в хранилище:",
          data ? "существуют" : "отсутствуют"
        )

        // Создаем новую базовую структуру
        const newStructure = {
          id: "0",
          title: "root",
          type: "folder",
          children: [],
        }

        // Если есть существующие данные, пытаемся их использовать
        if (
          data &&
          data.gh_bookmarks &&
          typeof data.gh_bookmarks === "object" &&
          data.gh_bookmarks.children &&
          Array.isArray(data.gh_bookmarks.children)
        ) {
          console.log(
            "[Background] Используем существующие данные для реконструкции"
          )

          // Функция для глубокого копирования и фильтрации структуры
          const cleanStructure = (item) => {
            if (!item || typeof item !== "object") return null

            // Базовая проверка полей
            const hasValidId = item.id && typeof item.id === "string"
            const hasValidTitle = item.title && typeof item.title === "string"
            const hasValidType =
              item.type && (item.type === "folder" || item.type === "bookmark")

            if (!hasValidId || !hasValidTitle || !hasValidType) {
              console.warn("[Background] Найден некорректный элемент:", item)
              return null
            }

            // Создаем новый объект с проверенными свойствами
            const newItem = {
              id: item.id,
              title: item.title,
              type: item.type,
            }

            // Добавляем URL для закладок
            if (
              item.type === "bookmark" &&
              item.url &&
              typeof item.url === "string"
            ) {
              newItem.url = item.url
            }

            // Проверяем и обрабатываем вложенные элементы
            if (
              item.type === "folder" &&
              item.children &&
              Array.isArray(item.children)
            ) {
              newItem.children = item.children
                .map((child) => cleanStructure(child))
                .filter((child) => child !== null)
            } else if (item.type === "folder") {
              // Если это папка без children, создаем пустой массив
              newItem.children = []
            }

            return newItem
          }

          // Копируем и очищаем существующую структуру
          const cleanedStructure = cleanStructure(data.gh_bookmarks)

          if (cleanedStructure) {
            console.log(
              "[Background] Структура успешно очищена и восстановлена"
            )
            newStructure.id = cleanedStructure.id
            newStructure.title = cleanedStructure.title
            newStructure.children = cleanedStructure.children
          } else {
            console.warn(
              "[Background] Не удалось очистить структуру, создаем новую"
            )
            // Добавляем стандартные папки
            newStructure.children.push(
              createDefaultFolder("Избранное"),
              createDefaultFolder("Работа"),
              createDefaultFolder("Личное")
            )
          }
        } else {
          console.log("[Background] Создаем новую структуру с базовыми папками")
          // Добавляем стандартные папки
          newStructure.children.push(
            createDefaultFolder("Избранное"),
            createDefaultFolder("Работа"),
            createDefaultFolder("Личное")
          )
        }

        // Сохраняем новую структуру
        await new Promise((resolve) => {
          chrome.storage.local.set({ gh_bookmarks: newStructure }, () => {
            if (chrome.runtime.lastError) {
              console.error(
                "[Background] Ошибка при сохранении структуры:",
                chrome.runtime.lastError
              )
              resolve(false)
            } else {
              console.log("[Background] Структура успешно сохранена")
              resolve(true)
            }
          })
        })

        // Отправляем успешный ответ
        sendResponse({
          success: true,
          message: "Структура закладок успешно исправлена",
          structure: newStructure,
        })
      })
    } catch (error) {
      console.error("[Background] Ошибка при исправлении структуры:", error)
      sendResponse({
        success: false,
        error: "Ошибка при исправлении структуры: " + error.message,
      })
    }

    return true
  }

  // Получение структуры папок для модального окна
  if (message.action === "getFolderStructure") {
    console.log("[Background] Получен запрос на получение структуры папок")

    // Получаем данные из хранилища
    chrome.storage.local.get("gh_bookmarks", (data) => {
      console.log(
        "[Background] Данные из хранилища получены:",
        data ? "Да" : "Нет"
      )

      if (data && data.gh_bookmarks) {
        console.log(
          "[Background] Структура данных:",
          JSON.stringify(data.gh_bookmarks).substring(0, 1000)
        )
      }

      // Если в хранилище ничего нет, просто возвращаем пустой массив
      if (!data || !data.gh_bookmarks) {
        console.log(
          "[Background] В хранилище нет закладок, возвращаем пустой массив"
        )
        sendResponse({
          success: true,
          folders: [],
          message: "В хранилище нет закладок",
        })
        return
      }

      const bookmarks = data.gh_bookmarks

      // Если структура повреждена, просто возвращаем пустой массив
      if (
        !bookmarks ||
        !bookmarks.children ||
        !Array.isArray(bookmarks.children)
      ) {
        console.log(
          "[Background] Структура закладок повреждена, возвращаем пустой массив"
        )
        sendResponse({
          success: true,
          folders: [],
          message: "Структура закладок повреждена",
        })
        return
      }

      // Извлекаем только папки
      const folders = []
      bookmarks.children.forEach((item) => {
        if (item && item.type === "folder") {
          // Копируем только нужные свойства
          folders.push({
            id: item.id,
            title: item.title,
            type: "folder",
            children:
              item.children && Array.isArray(item.children)
                ? extractNestedFolders(item.children)
                : [],
          })
        }
      })

      // Выведем все папки для отладки
      folders.forEach((folder) => {
        console.log(
          `[Background] Папка: ${folder.title} (ID: ${folder.id}), подпапок: ${folder.children.length}`
        )
      })

      console.log("[Background] Найдено папок:", folders.length)
      sendResponse({
        success: true,
        folders: folders,
      })
    })

    return true
  }

  // Получение текущей структуры закладок для отладки
  if (message.action === "getBookmarksDebug") {
    console.log(
      "[Background] Запрос на получение структуры закладок для отладки"
    )

    chrome.storage.local.get("gh_bookmarks", async (data) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[Background] Ошибка при получении данных:",
          chrome.runtime.lastError
        )
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message,
        })
        return
      }

      // Если запрошена принудительная инициализация
      if (message.forceInit) {
        console.log(
          "[Background] Запрошена принудительная инициализация структуры"
        )
        try {
          const newStructure = await forceInitializeBookmarks()
          sendResponse({
            success: true,
            message: "Структура принудительно переинициализирована",
            bookmarks: newStructure,
          })
        } catch (error) {
          sendResponse({
            success: false,
            error: "Ошибка при принудительной инициализации: " + error.message,
          })
        }
        return
      }

      if (!data || !data.gh_bookmarks) {
        console.warn(
          "[Background] Структура закладок отсутствует, создаем новую"
        )

        try {
          // Инициализируем структуру закладок
          const newStructure = await forceInitializeBookmarks()
          sendResponse({
            success: true,
            message: "Создана новая структура закладок",
            bookmarks: newStructure,
          })
        } catch (error) {
          sendResponse({
            success: false,
            error: "Не удалось создать структуру: " + error.message,
          })
        }
      } else {
        // Проверяем корректность структуры
        let bookmarks = data.gh_bookmarks
        let needsFix = false

        if (!bookmarks.id || !bookmarks.type || !bookmarks.title) {
          console.warn(
            "[Background] Структура некорректна, отсутствуют базовые свойства"
          )
          needsFix = true

          // Добавляем базовые свойства
          bookmarks.id = bookmarks.id || "0"
          bookmarks.type = bookmarks.type || "folder"
          bookmarks.title = bookmarks.title || "root"
        }

        if (!bookmarks.children || !Array.isArray(bookmarks.children)) {
          console.warn("[Background] Отсутствует массив children, добавляем")
          needsFix = true
          bookmarks.children = []
        }

        // Проверяем наличие хотя бы одной папки
        const hasFolders = bookmarks.children.some(
          (item) => item && item.type === "folder" && item.id && item.title
        )

        if (!hasFolders && bookmarks.children.length === 0) {
          console.warn("[Background] В структуре нет папок, добавляем базовые")
          needsFix = true

          // Добавляем базовые папки
          bookmarks.children.push(
            {
              id: "folder_favorites_" + Date.now(),
              title: "Избранное",
              type: "folder",
              children: [],
            },
            {
              id: "folder_work_" + Date.now(),
              title: "Работа",
              type: "folder",
              children: [],
            },
            {
              id: "folder_personal_" + Date.now(),
              title: "Личное",
              type: "folder",
              children: [],
            }
          )
        }

        if (needsFix) {
          console.log("[Background] Исправляем структуру закладок")

          // Сохраняем исправленную структуру
          chrome.storage.local.set({ gh_bookmarks: bookmarks }, () => {
            if (chrome.runtime.lastError) {
              console.error(
                "[Background] Ошибка при сохранении исправленной структуры:",
                chrome.runtime.lastError
              )
              sendResponse({
                success: false,
                error:
                  "Не удалось сохранить исправленную структуру: " +
                  chrome.runtime.lastError.message,
              })
            } else {
              console.log(
                "[Background] Исправленная структура успешно сохранена"
              )
              sendResponse({
                success: true,
                bookmarks: bookmarks,
                message: "Структура исправлена",
              })
            }
          })
        } else {
          console.log(
            "[Background] Структура корректна, возвращаем без изменений"
          )
          sendResponse({
            success: true,
            bookmarks: bookmarks,
          })
        }
      }
    })

    return true
  }

  // Обработка сохранения закладки из контекстного меню
  if (message.action === "saveBookmark") {
    console.log(
      "[Background] Получен запрос на сохранение закладки:",
      message.data
    )

    const { parentId, bookmark } = message.data

    if (!bookmark || !bookmark.title || !bookmark.url) {
      console.error("[Background] Некорректные данные закладки:", bookmark)
      sendResponse({
        success: false,
        error: "Некорректные данные закладки",
      })
      return true
    }

    // Получаем текущую структуру из хранилища
    chrome.storage.local.get("gh_bookmarks", (data) => {
      console.log(
        "[Background] Текущая структура перед сохранением:",
        data && data.gh_bookmarks
          ? `ID: ${data.gh_bookmarks.id}, тип: ${data.gh_bookmarks.type}`
          : "отсутствует"
      )

      // Если структуры нет, создаем пустую корневую папку
      let bookmarks =
        data && data.gh_bookmarks
          ? data.gh_bookmarks
          : {
              id: "0",
              title: "root",
              type: "folder",
              children: [],
            }

      // Убедимся, что у корневого элемента есть children
      if (!bookmarks.children) {
        bookmarks.children = []
      }

      // Если parentId = "0", добавляем в корень
      if (parentId === "0") {
        console.log(
          "[Background] Добавляем закладку в корневую папку:",
          bookmark.title
        )
        bookmarks.children.push(bookmark)

        // Логируем обновленную структуру
        console.log(
          "[Background] Обновленная структура корня:",
          `Количество детей: ${bookmarks.children.length}`
        )
      } else {
        // Иначе ищем указанную папку и добавляем в нее
        console.log(
          "[Background] Пытаемся добавить закладку в папку ID:",
          parentId
        )
        const result = addBookmarkToFolder(
          bookmarks.children,
          parentId,
          bookmark
        )
        if (!result.success) {
          console.error(
            "[Background] Ошибка добавления закладки:",
            result.error
          )
          sendResponse({
            success: false,
            error: result.error,
          })
          return
        }
        console.log("[Background] Закладка успешно добавлена в папку")
      }

      // Логируем структуру перед сохранением
      console.log(
        "[Background] Сохраняем структуру, общее количество детей:",
        bookmarks.children.length
      )

      // Сохраняем обновленную структуру
      chrome.storage.local.set({ gh_bookmarks: bookmarks }, () => {
        if (chrome.runtime.lastError) {
          console.error(
            "[Background] Ошибка сохранения:",
            chrome.runtime.lastError
          )
          sendResponse({
            success: false,
            error: chrome.runtime.lastError.message,
          })
          return
        }

        console.log("[Background] Закладка успешно сохранена")

        // Проверяем, что действительно сохранилось
        chrome.storage.local.get("gh_bookmarks", (updatedData) => {
          console.log(
            "[Background] Проверка после сохранения:",
            updatedData && updatedData.gh_bookmarks
              ? `Количество детей: ${updatedData.gh_bookmarks.children.length}`
              : "Структура отсутствует"
          )

          sendResponse({
            success: true,
            message: "Закладка успешно сохранена",
          })
        })
      })
    })

    return true
  }

  // Обработка запроса на обновление фавикона из страницы (новый подход для ручного обновления фавикона 980-1050 и 1373-1542 - рабочий вариант)
  if (message.action === "updateFaviconFromPage") {
    console.log(
      "[Background] Запрос на обновление фавикона из страницы:",
      message
    )

    // Создаем новую вкладку с URL закладки
    chrome.tabs.create({ url: message.url, active: true }, async (tab) => {
      try {
        // Ждем, пока вкладка полностью загрузится
        await waitForTabLoad(tab.id)

        // Инжектируем скрипт для извлечения фавикона из DOM
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: extractFaviconFromDOM,
        })

        // Получаем результат выполнения скрипта
        const result = results[0].result
        console.log("[Background] Результат извлечения фавикона:", result)

        if (result.success && result.faviconUrl) {
          // Обновляем фавикон в хранилище
          await updateBookmarkFaviconInStorage(
            message.bookmarkId,
            result.faviconUrl
          )

          // Закрываем вкладку
          chrome.tabs.remove(tab.id)

          // Отправляем ответ об успешном обновлении
          sendResponse({
            success: true,
            updated: true,
            favicon: result.faviconUrl,
          })
        } else {
          // Если не удалось получить фавикон, закрываем вкладку и отправляем ошибку
          chrome.tabs.remove(tab.id)
          sendResponse({
            success: false,
            error: result.error || "Не удалось получить фавикон из страницы",
          })
        }
      } catch (error) {
        console.error("[Background] Ошибка при обновлении фавикона:", error)

        // Закрываем вкладку при ошибке
        try {
          chrome.tabs.remove(tab.id)
        } catch (e) {
          console.error("[Background] Ошибка при закрытии вкладки:", e)
        }

        sendResponse({
          success: false,
          error: error.message || "Неизвестная ошибка",
        })
      }
    })

    // Возвращаем true для асинхронного ответа
    return true
  }

  // Для других сообщений
  return false
})

/**
 * Добавляет папку в указанную родительскую папку
 * @param {Array} items - Массив элементов для поиска родительской папки
 * @param {string} parentId - ID родительской папки
 * @param {Object} folder - Объект новой папки
 * @returns {Object} - Результат операции
 */
function addFolderToFolder(items, parentId, folder) {
  for (const item of items) {
    if (item.id === parentId && item.type === "folder") {
      console.log(`Найдена родительская папка ${item.title} (ID: ${item.id})`)

      if (!item.children) {
        item.children = []
      }

      item.children.push(folder)
      console.log(`Папка ${folder.title} добавлена в папку ${item.title}`)
      return { success: true }
    }

    if (
      item.children &&
      Array.isArray(item.children) &&
      item.children.length > 0
    ) {
      const result = addFolderToFolder(item.children, parentId, folder)
      if (result.success) {
        return result
      }
    }
  }

  return { success: false, error: "Родительская папка не найдена" }
}

/**
 * Добавляет закладку в указанную папку по ID
 * @param {Array} items - Массив элементов для поиска родительской папки
 * @param {string} parentId - ID родительской папки
 * @param {Object} bookmark - Объект новой закладки
 * @returns {Object} - Результат операции
 */
function addBookmarkToFolder(items, parentId, bookmark) {
  if (!items || !Array.isArray(items)) {
    return { success: false, error: "Некорректный массив элементов" }
  }

  for (const item of items) {
    if (item.id === parentId && item.type === "folder") {
      console.log(
        `[Background] Найдена родительская папка ${item.title} (ID: ${item.id})`
      )

      if (!item.children) {
        item.children = []
      }

      item.children.push(bookmark)
      console.log(
        `[Background] Закладка ${bookmark.title} добавлена в папку ${item.title}`
      )
      return { success: true }
    }

    if (
      item.children &&
      Array.isArray(item.children) &&
      item.children.length > 0
    ) {
      const result = addBookmarkToFolder(item.children, parentId, bookmark)
      if (result.success) {
        return result
      }
    }
  }

  return { success: false, error: "Родительская папка не найдена" }
}

/**
 * Рекурсивно извлекает вложенные папки из дерева
 * @param {Array} items - Массив элементов
 * @returns {Array} - Массив папок
 */
function extractNestedFolders(items) {
  if (!items || !Array.isArray(items)) return []

  const folders = []

  items.forEach((item) => {
    if (item && typeof item === "object" && item.type === "folder") {
      console.log(
        `[Background] extractNestedFolders: обрабатываем папку ${item.title} (ID: ${item.id})`
      )

      // Создаем объект папки
      const folder = {
        id: item.id,
        title: item.title,
        type: "folder",
        children: [],
      }

      // Рекурсивно извлекаем дочерние папки
      if (item.children && Array.isArray(item.children)) {
        folder.children = extractNestedFolders(item.children)
        console.log(
          `[Background] extractNestedFolders: для папки ${item.title} найдено ${folder.children.length} вложенных папок`
        )
      }

      folders.push(folder)
    }
  })

  console.log(
    `[Background] extractNestedFolders: извлечено ${folders.length} папок из ${items.length} элементов`
  )
  return folders
}

/**
 * Генерирует уникальный идентификатор для элементов закладок
 * @returns {string} - Уникальный ID
 */
function generateUniqueId() {
  const timestamp = Date.now().toString(36)
  const randomStr = Math.random().toString(36).substring(2, 10)
  return `gh_${timestamp}_${randomStr}`
}

/**
 * Проверяет и исправляет структуру закладок в хранилище
 * @returns {Promise} Promise, который разрешается после завершения проверки
 */
async function fixBookmarksStructure() {
  console.log("[Background] Проверка и исправление структуры закладок")

  try {
    const data = await new Promise((resolve) =>
      chrome.storage.local.get("gh_bookmarks", resolve)
    )

    if (!data || !data.gh_bookmarks) {
      console.warn(
        "[Background] Закладки не найдены, создаем базовую структуру"
      )
      // Создаем базовую структуру папок
      await forceInitializeBookmarks()
      return true
    }

    // Получаем структуру
    let bookmarks = data.gh_bookmarks
    let modified = false

    // Проверяем наличие базовых свойств у корневого элемента
    if (!bookmarks.id || !bookmarks.type || !bookmarks.title) {
      console.log("[Background] Исправляем базовые свойства корневого элемента")
      bookmarks.id = bookmarks.id || "0"
      bookmarks.type = bookmarks.type || "folder"
      bookmarks.title = bookmarks.title || "root"
      modified = true
    }

    // Проверяем наличие массива детей
    if (!bookmarks.children || !Array.isArray(bookmarks.children)) {
      console.log("[Background] Добавляем массив children")
      bookmarks.children = []
      modified = true
    }

    // Проверяем наличие папок
    if (bookmarks.children.length === 0) {
      console.log("[Background] Добавляем стандартные папки")
      bookmarks.children.push(
        {
          id: "folder_favorites_" + Date.now(),
          title: "Избранное",
          type: "folder",
          children: [],
        },
        {
          id: "folder_work_" + Date.now(),
          title: "Работа",
          type: "folder",
          children: [],
        },
        {
          id: "folder_personal_" + Date.now(),
          title: "Личное",
          type: "folder",
          children: [],
        }
      )
      modified = true
    }

    // Если были внесены изменения, сохраняем структуру
    if (modified) {
      console.log("[Background] Сохраняем исправленную структуру")
      await new Promise((resolve) =>
        chrome.storage.local.set({ gh_bookmarks: bookmarks }, resolve)
      )
      return true
    } else {
      console.log("[Background] Структура корректна, изменения не требуются")
      return false
    }
  } catch (error) {
    console.error(
      "[Background] Ошибка при исправлении структуры закладок:",
      error
    )
    // При критической ошибке создаем структуру заново
    await forceInitializeBookmarks()
    return true
  }
}

/**
 * Принудительно создает базовую структуру закладок
 * @returns {Promise<Object>} Promise, который разрешается созданной структурой
 */
async function forceInitializeBookmarks() {
  console.log("[Background] Создание базовой структуры закладок")

  // Создаем базовую структуру с тремя основными папками
  const rootStructure = {
    id: "0",
    title: "root",
    type: "folder",
    children: [
      {
        id: "folder_favorites_" + Date.now(),
        title: "Избранное",
        type: "folder",
        children: [],
      },
      {
        id: "folder_work_" + Date.now(),
        title: "Работа",
        type: "folder",
        children: [],
      },
      {
        id: "folder_personal_" + Date.now(),
        title: "Личное",
        type: "folder",
        children: [],
      },
    ],
  }

  // Сохраняем структуру в хранилище
  try {
    await new Promise((resolve, reject) =>
      chrome.storage.local.set({ gh_bookmarks: rootStructure }, () => {
        if (chrome.runtime.lastError) {
          console.error(
            "[Background] Ошибка сохранения структуры:",
            chrome.runtime.lastError
          )
          reject(chrome.runtime.lastError)
        } else {
          console.log("[Background] Базовая структура успешно создана")
          resolve()
        }
      })
    )
    return rootStructure
  } catch (error) {
    console.error(
      "[Background] Критическая ошибка при создании структуры:",
      error
    )
    throw error
  }
}

/**
 * Инициализирует базовую структуру закладок
 * @returns {Promise} Promise, который разрешается после инициализации
 */
async function initializeDefaultBookmarks() {
  // Просто вызываем новую функцию для обеспечения обратной совместимости
  console.log(
    "[Background] Вызов initializeDefaultBookmarks перенаправлен на forceInitializeBookmarks"
  )
  return await forceInitializeBookmarks()
}

/**
 * Извлекает только папки из массива элементов
 * @param {Array} items - Массив элементов
 * @returns {Array} - Массив папок
 */
function extractFolders(items) {
  if (!items || !Array.isArray(items)) return []

  const folders = []

  items.forEach((item) => {
    if (item && item.type === "folder") {
      folders.push({
        id: item.id,
        title: item.title,
        type: "folder",
        children:
          item.children && Array.isArray(item.children)
            ? extractFolders(item.children)
            : [],
      })
    }
  })

  return folders
}

/**
 * Ожидает полной загрузки вкладки
 * @param {number} tabId - ID вкладки
 * @returns {Promise} - Promise, который разрешается, когда вкладка загружена
 */
function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener)
        // Даем дополнительное время для полной загрузки DOM и ресурсов
        setTimeout(resolve, 1000)
      }
    }

    chrome.tabs.onUpdated.addListener(listener)

    // Таймаут на случай, если вкладка не загрузится
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      reject(new Error("Таймаут загрузки вкладки"))
    }, 30000)
  })
}

/**
 * Функция для извлечения фавикона из DOM страницы
 * Выполняется в контексте страницы через chrome.scripting.executeScript
 */
function extractFaviconFromDOM() {
  try {
    // Массив для хранения найденных фавиконов
    const favicons = []

    // 1. Ищем Apple Touch Icon (обычно высокого качества)
    const appleTouchIcons = document.querySelectorAll(
      'link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
    )
    if (appleTouchIcons.length > 0) {
      for (const icon of appleTouchIcons) {
        if (icon.href) {
          favicons.push({
            url: icon.href,
            size: parseInt(icon.sizes?.value?.split("x")[0] || 0),
            type: "apple-touch-icon",
          })
        }
      }
    }

    // 2. Ищем SVG иконки
    const svgIcons = document.querySelectorAll(
      'link[rel="icon"][type="image/svg+xml"], link[rel="icon"][href$=".svg"]'
    )
    if (svgIcons.length > 0) {
      for (const icon of svgIcons) {
        if (icon.href) {
          favicons.push({
            url: icon.href,
            size: 1000, // Высокий приоритет для SVG
            type: "svg",
          })
        }
      }
    }

    // 3. Ищем стандартные иконки
    const standardIcons = document.querySelectorAll(
      'link[rel="icon"], link[rel="shortcut icon"]'
    )
    if (standardIcons.length > 0) {
      for (const icon of standardIcons) {
        if (icon.href) {
          const size = parseInt(icon.sizes?.value?.split("x")[0] || 0)
          favicons.push({
            url: icon.href,
            size: size || 32, // Стандартный размер, если не указан
            type: "standard",
          })
        }
      }
    }

    // 4. Добавляем стандартный путь к favicon.ico
    favicons.push({
      url: new URL("/favicon.ico", window.location.origin).href,
      size: 16,
      type: "default",
    })

    // Сортируем по размеру (от большего к меньшему)
    favicons.sort((a, b) => b.size - a.size)

    // Возвращаем лучший фавикон
    if (favicons.length > 0) {
      return {
        success: true,
        faviconUrl: favicons[0].url,
        allFavicons: favicons,
      }
    }

    return {
      success: false,
      error: "Фавиконы не найдены на странице",
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || "Ошибка при извлечении фавикона",
    }
  }
}

/**
 * Обновляет фавикон закладки в хранилище
 * @param {string} bookmarkId - ID закладки
 * @param {string} faviconUrl - URL фавикона
 */
async function updateBookmarkFaviconInStorage(bookmarkId, faviconUrl) {
  return new Promise((resolve, reject) => {
    // Получаем текущие закладки из хранилища
    chrome.storage.local.get("gh_bookmarks", (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError)
        return
      }

      const bookmarks = result.gh_bookmarks || []

      // Функция для поиска и обновления закладки
      function updateFaviconInTree(items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i]

          if (item.id === bookmarkId) {
            // Нашли нужную закладку, обновляем фавикон
            item.favicon = faviconUrl
            return true
          }

          if (item.type === "folder" && Array.isArray(item.children)) {
            if (updateFaviconInTree(item.children)) {
              return true
            }
          }
        }

        return false
      }

      // Обновляем фавикон в дереве закладок
      const updated = updateFaviconInTree(bookmarks)

      if (updated) {
        // Сохраняем обновленные закладки
        chrome.storage.local.set({ gh_bookmarks: bookmarks }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError)
          } else {
            resolve(true)
          }
        })
      } else {
        reject(new Error("Закладка не найдена"))
      }
    })
  })
}
