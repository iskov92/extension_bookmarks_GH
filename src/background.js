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
      await initializeDefaultBookmarks()
    } else {
      // Проверяем структуру на наличие проблем
      console.log("[Background] При установке: проверяем структуру закладок")
      await fixBookmarksStructure()
    }
  } catch (error) {
    console.error("[Background] Ошибка при инициализации закладок:", error)
    // При ошибке создаем новую структуру
    await initializeDefaultBookmarks()
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

// Обрабатывает сообщения от popup и content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("[Background] Получено сообщение:", request, "от:", sender)

  // Обработка тестового соединения
  if (request.action === "testConnection") {
    console.log("[Background] Получен тестовый запрос:", request.data)
    sendResponse({
      success: true,
      message: "Соединение работает",
      received: request.data,
      timestamp: Date.now(),
    })
    return true
  }

  // Добавим новый обработчик для полного сброса и пересоздания структуры
  if (request.action === "resetBookmarksStructure") {
    console.log(
      "[Background] Получен запрос на полный сброс структуры закладок"
    )

    // Полностью удаляем текущую структуру
    chrome.storage.local.remove("gh_bookmarks", async () => {
      console.log("[Background] Текущая структура закладок удалена")

      // Создаем новую базовую структуру
      await initializeDefaultBookmarks()

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
  if (request.action === "contentScriptLoaded") {
    console.log(
      "[Background] Content script загружен на странице:",
      request.url
    )
    sendResponse({ status: "received" })
    return true
  }

  // Запрос на исправление структуры закладок
  if (request.action === "fixBookmarksStructure") {
    console.log("[Background] Получен запрос на исправление структуры закладок")

    // Асинхронно исправляем структуру закладок
    fixBookmarksStructure()
      .then((result) => {
        if (result === true) {
          console.log("[Background] Структура успешно исправлена")

          // Дополнительная проверка после исправления
          chrome.storage.local.get("gh_bookmarks", (data) => {
            if (!data || !data.gh_bookmarks || !data.gh_bookmarks.children) {
              console.error(
                "[Background] После исправления структура все еще некорректна, пересоздаем"
              )
              // Если после исправления структура все еще некорректна, пересоздаем заново
              initializeDefaultBookmarks().then(() => {
                sendResponse({
                  success: true,
                  message: "Структура полностью пересоздана",
                })
              })
            } else {
              // Проверяем достаточно ли хорошо исправлена структура
              const needsRecreation = checkIfNeedsRecreation(data.gh_bookmarks)

              if (needsRecreation) {
                console.warn(
                  "[Background] Структура исправлена, но все еще имеет проблемы, пересоздаем"
                )
                // Пересоздаем только если структура действительно требует этого
                initializeDefaultBookmarks().then(() => {
                  sendResponse({
                    success: true,
                    message:
                      "Структура полностью пересоздана из-за неустранимых проблем",
                  })
                })
              } else {
                console.log(
                  "[Background] Структура корректно исправлена, пересоздание не требуется"
                )
                sendResponse({ success: true })
              }
            }
          })
        } else {
          console.log("[Background] Структура не требовала исправлений")
          sendResponse({ success: true })
        }
      })
      .catch((error) => {
        console.error(
          "[Background] Ошибка при исправлении структуры закладок:",
          error
        )
        // При ошибке создаем новую структуру с нуля
        initializeDefaultBookmarks().then(() => {
          sendResponse({
            success: true,
            message: "Создана новая структура после ошибки",
          })
        })
      })

    return true
  }

  // Получение структуры папок для модального окна
  if (request.action === "getFolderStructure") {
    console.log("[Background] Получен запрос на получение структуры папок")

    // Выводим информацию об отправителе
    console.log("[Background] Отправитель запроса:", sender)

    try {
      // Получаем данные из хранилища
      chrome.storage.local.get("gh_bookmarks", async (data) => {
        console.log(
          "[Background] Результат получения данных из хранилища:",
          data ? "Данные получены" : "Данные не получены"
        )

        if (data && data.gh_bookmarks) {
          console.log(
            "[Background] Структура gh_bookmarks:",
            "id:",
            data.gh_bookmarks.id,
            "title:",
            data.gh_bookmarks.title,
            "type:",
            data.gh_bookmarks.type,
            "children:",
            data.gh_bookmarks.children
              ? `Array(${data.gh_bookmarks.children.length})`
              : "отсутствует"
          )
        }

        // Проверка на наличие данных
        if (!data || !data.gh_bookmarks) {
          console.error(
            "[Background] Закладки не найдены в хранилище, создаем базовую структуру"
          )

          // Инициализируем базовую структуру
          const initialized = await initializeDefaultBookmarks()

          if (!initialized) {
            console.error("[Background] Не удалось инициализировать структуру")
            sendResponse({
              success: false,
              error: "Не удалось создать базовую структуру закладок",
            })
            return
          }

          // Получаем свежесозданные данные
          chrome.storage.local.get("gh_bookmarks", (newData) => {
            console.log(
              "[Background] Новые данные после инициализации:",
              newData ? "Данные получены" : "Данные не получены"
            )

            if (newData && newData.gh_bookmarks) {
              console.log(
                "[Background] Новая структура gh_bookmarks:",
                "id:",
                newData.gh_bookmarks.id,
                "title:",
                newData.gh_bookmarks.title,
                "type:",
                newData.gh_bookmarks.type,
                "children:",
                newData.gh_bookmarks.children
                  ? `Array(${newData.gh_bookmarks.children.length})`
                  : "отсутствует"
              )
            }

            if (
              !newData ||
              !newData.gh_bookmarks ||
              !newData.gh_bookmarks.children
            ) {
              console.error("[Background] Не удалось создать базовую структуру")
              sendResponse({
                success: false,
                error: "Не удалось создать базовую структуру",
              })
              return
            }

            // Извлекаем папки из новой структуры
            try {
              // Создаем массив папок напрямую, если extractFolders не работает
              const folders = []

              if (
                newData.gh_bookmarks.children &&
                newData.gh_bookmarks.children.length > 0
              ) {
                newData.gh_bookmarks.children.forEach((item) => {
                  if (item && item.type === "folder") {
                    folders.push({
                      id: item.id,
                      title: item.title,
                      type: "folder",
                      children: [],
                    })
                  }
                })
              }

              console.log("[Background] Папки из новой структуры:", folders)
              sendResponse({ success: true, folders: folders })
            } catch (error) {
              console.error(
                "[Background] Ошибка при извлечении папок из новой структуры:",
                error
              )
              sendResponse({
                success: false,
                error:
                  "Ошибка при извлечении папок из новой структуры: " +
                  error.message,
              })
            }
          })
          return
        }

        const bookmarks = data.gh_bookmarks
        console.log(
          "[Background] Полученные закладки:",
          "id:",
          bookmarks.id,
          "title:",
          bookmarks.title,
          "type:",
          bookmarks.type
        )

        // Если bookmarks не является объектом или не имеет нужных свойств, создаем новую структуру
        if (!bookmarks || typeof bookmarks !== "object") {
          console.error(
            "[Background] Некорректная структура закладок, создаем заново"
          )

          await initializeDefaultBookmarks()

          // Получаем свежесозданные данные
          chrome.storage.local.get("gh_bookmarks", (newData) => {
            // Создаем массив папок напрямую
            const folders = []

            if (
              newData.gh_bookmarks.children &&
              newData.gh_bookmarks.children.length > 0
            ) {
              newData.gh_bookmarks.children.forEach((item) => {
                if (item && item.type === "folder") {
                  folders.push({
                    id: item.id,
                    title: item.title,
                    type: "folder",
                    children: [],
                  })
                }
              })
            }

            sendResponse({ success: true, folders: folders })
          })
          return
        }

        // Проверяем наличие children у корневого элемента
        if (!bookmarks.children || !Array.isArray(bookmarks.children)) {
          console.error(
            "[Background] Корневой элемент не имеет корректного массива children"
          )
          console.log(
            "[Background] Детали корневого элемента:",
            JSON.stringify(bookmarks).substring(0, 500)
          )

          // Создаем новую структуру с нуля
          await initializeDefaultBookmarks()

          // Получаем свежесозданные данные
          chrome.storage.local.get("gh_bookmarks", (newData) => {
            if (
              !newData ||
              !newData.gh_bookmarks ||
              !newData.gh_bookmarks.children
            ) {
              console.error("[Background] Не удалось создать новую структуру")
              sendResponse({
                success: false,
                error: "Не удалось создать новую структуру закладок",
              })
              return
            }

            // Создаем массив папок напрямую
            const folders = []

            if (
              newData.gh_bookmarks.children &&
              newData.gh_bookmarks.children.length > 0
            ) {
              newData.gh_bookmarks.children.forEach((item) => {
                if (item && item.type === "folder") {
                  folders.push({
                    id: item.id,
                    title: item.title,
                    type: "folder",
                    children: [],
                  })
                }
              })
            }

            sendResponse({ success: true, folders: folders })
          })
          return
        }

        try {
          // Извлекаем только папки из дерева закладок - используем прямое формирование массива
          console.log("[Background] Начинаем извлечение папок из закладок...")

          const folders = []

          if (bookmarks.children && bookmarks.children.length > 0) {
            bookmarks.children.forEach((item) => {
              if (item && item.type === "folder") {
                folders.push({
                  id: item.id,
                  title: item.title,
                  type: "folder",
                  children: [],
                })
              }
            })
          }

          console.log("[Background] Папки из хранилища:", folders)

          // Проверяем, не пуст ли массив папок
          if (!folders || folders.length === 0) {
            console.warn(
              "[Background] Не найдено ни одной папки, создаем базовую структуру"
            )

            // Создаем новую структуру с нуля
            await initializeDefaultBookmarks()

            // Получаем свежесозданные данные
            chrome.storage.local.get("gh_bookmarks", (newData) => {
              if (
                !newData ||
                !newData.gh_bookmarks ||
                !newData.gh_bookmarks.children
              ) {
                console.error("[Background] Не удалось создать новую структуру")
                sendResponse({
                  success: false,
                  error: "Не удалось создать новую структуру закладок",
                })
                return
              }

              // Создаем массив папок напрямую
              const newFolders = []

              if (
                newData.gh_bookmarks.children &&
                newData.gh_bookmarks.children.length > 0
              ) {
                newData.gh_bookmarks.children.forEach((item) => {
                  if (item && item.type === "folder") {
                    newFolders.push({
                      id: item.id,
                      title: item.title,
                      type: "folder",
                      children: [],
                    })
                  }
                })
              }

              sendResponse({ success: true, folders: newFolders })
            })
            return
          }

          // Отправляем реальную структуру папок
          sendResponse({ success: true, folders: folders })
        } catch (error) {
          console.error("[Background] Ошибка при извлечении папок:", error)
          sendResponse({
            success: false,
            error: "Ошибка при извлечении папок: " + error.message,
          })
        }
      })
    } catch (error) {
      console.error(
        "[Background] Критическая ошибка при получении структуры папок:",
        error
      )
      sendResponse({
        success: false,
        error: "Критическая ошибка: " + error.message,
      })
    }

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
        // Получаем favicon через Google Favicon Service
        const hostname = new URL(url).hostname
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`

        // Создаем новую закладку
        const newBookmark = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: title,
          url: url,
          type: "bookmark",
          icon: faviconUrl,
          addedAt: new Date().toISOString(),
        }

        // Добавляем закладку в выбранную папку
        let bookmarks = data.gh_bookmarks

        // Проверяем, инициализировано ли свойство children
        if (!bookmarks.children) {
          console.log(
            "Свойство children не инициализировано в корневом объекте, создаем его"
          )
          bookmarks.children = []
        }

        let result = { success: false, error: "Не удалось добавить закладку" }

        if (parentId === "0") {
          // Добавляем в корневую папку
          console.log("Добавляем закладку в корневую папку")
          bookmarks.children.push(newBookmark)
          result = { success: true }
        } else {
          // Добавляем во вложенную папку
          console.log(`Добавляем закладку в папку с ID: ${parentId}`)
          result = addBookmarkToFolder(
            bookmarks.children,
            parentId,
            newBookmark
          )
        }

        if (!result.success) {
          console.error("Не удалось добавить закладку в папку:", result.error)
          sendResponse({ success: false, error: result.error })
          return
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

  // Создание новой папки
  if (request.action === "createFolder") {
    console.log("Получен запрос на создание новой папки:", request.data)

    const { parentId, title } = request.data

    chrome.storage.local.get("gh_bookmarks", async (data) => {
      if (!data || !data.gh_bookmarks) {
        console.error("Не удалось получить закладки из хранилища")

        // Попробуем создать базовую структуру
        await initializeDefaultBookmarks()

        // Повторно получаем данные
        chrome.storage.local.get("gh_bookmarks", (newData) => {
          if (!newData || !newData.gh_bookmarks) {
            sendResponse({
              success: false,
              error: "Не удалось создать базовую структуру",
            })
            return
          }

          // Продолжаем с созданием папки в новой структуре
          createFolderInStructure(
            newData.gh_bookmarks,
            parentId,
            title,
            sendResponse
          )
        })
        return true
      }

      // Создаем папку в существующей структуре
      createFolderInStructure(data.gh_bookmarks, parentId, title, sendResponse)
    })

    return true
  }

  // Если не найден обработчик, возвращаем ошибку
  console.log("[Background] Не найден обработчик для действия:", request.action)
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

// Обработка запуска расширения для создания контекстного меню
chrome.runtime.onStartup.addListener(async () => {
  console.log("Расширение запущено")

  try {
    // Проверяем существование структуры закладок
    const data = await new Promise((resolve) =>
      chrome.storage.local.get("gh_bookmarks", resolve)
    )

    if (!data || !data.gh_bookmarks) {
      console.log(
        "При запуске: закладки не обнаружены, создаем базовую структуру"
      )
      await initializeDefaultBookmarks()
    } else {
      // Проверяем структуру на наличие проблем
      console.log("При запуске: проверяем структуру закладок")
      await fixBookmarksStructure()
    }
  } catch (error) {
    console.error("Ошибка при проверке закладок при запуске:", error)
    // При ошибке создаем новую структуру
    await initializeDefaultBookmarks()
  }

  // Создаем контекстное меню
  createContextMenu()
})

/**
 * Проверяет, требуется ли пересоздание структуры закладок
 * @param {Object} bookmarks - Структура закладок
 * @returns {boolean} - true, если структура требует пересоздания
 */
function checkIfNeedsRecreation(bookmarks) {
  // Проверяем наличие критических проблем, которые нельзя исправить

  // 1. Проверка корневого элемента
  if (!bookmarks || typeof bookmarks !== "object") {
    console.error(
      "[Background] Критическая проблема: корневой элемент не является объектом"
    )
    return true
  }

  // 2. Проверка обязательных свойств корневого элемента
  if (!bookmarks.id || !bookmarks.title || !bookmarks.type) {
    console.error(
      "[Background] Критическая проблема: отсутствуют обязательные свойства в корневом элементе"
    )
    return true
  }

  // 3. Проверка массива children
  if (!bookmarks.children || !Array.isArray(bookmarks.children)) {
    console.error(
      "[Background] Критическая проблема: children не существует или не является массивом"
    )
    return true
  }

  // 4. Проверка содержимого children - должна быть хотя бы одна папка
  const hasFolders = bookmarks.children.some(
    (item) =>
      item &&
      typeof item === "object" &&
      (item.type === "folder" ||
        (item.children && Array.isArray(item.children)))
  )

  if (!hasFolders) {
    console.error("[Background] Критическая проблема: в структуре нет папок")
    return true
  }

  // 5. Проверка корректности всех элементов в children
  const hasInvalidItems = bookmarks.children.some(
    (item) => !item || typeof item !== "object" || !item.id || !item.title
  )

  if (hasInvalidItems) {
    console.error(
      "[Background] Критическая проблема: есть некорректные элементы в children"
    )
    return true
  }

  // Структура достаточно хороша, пересоздание не требуется
  return false
}

/**
 * Проверяет и исправляет структуру закладок в хранилище
 * @returns {Promise} Promise, который разрешается после завершения проверки
 */
async function fixBookmarksStructure() {
  console.log("Проверка и исправление структуры закладок")

  try {
    const data = await new Promise((resolve) =>
      chrome.storage.local.get("gh_bookmarks", resolve)
    )

    if (!data || !data.gh_bookmarks) {
      console.warn("Закладки не найдены, создаем базовую структуру")

      // Создаем базовую структуру папок
      await initializeDefaultBookmarks()
      return true
    }

    let bookmarks = data.gh_bookmarks
    let modified = false

    console.log(
      "Текущая структура корневого элемента:",
      "id:",
      bookmarks.id,
      "title:",
      bookmarks.title,
      "type:",
      bookmarks.type,
      "children:",
      bookmarks.children ? `Array(${bookmarks.children.length})` : "отсутствует"
    )

    // Если есть старая версия со структурой, которая может быть несовместима,
    // проверяем ее формат и при необходимости миграции полностью пересоздаем
    if (isOldStructureFormat(bookmarks)) {
      console.log(
        "[Background] Обнаружена устаревшая или несовместимая структура, выполняем полное пересоздание"
      )
      await initializeDefaultBookmarks()
      return true
    }

    // Проверяем наличие id у корневого элемента
    if (!bookmarks.id) {
      console.log("Корневой элемент не имеет id, добавляем")
      bookmarks.id = "0"
      modified = true
    }

    // Проверяем наличие type у корневого элемента
    if (!bookmarks.type) {
      console.log("Корневой элемент не имеет type, добавляем")
      bookmarks.type = "folder"
      modified = true
    }

    // Проверяем наличие title у корневого элемента
    if (!bookmarks.title) {
      console.log("Корневой элемент не имеет title, добавляем")
      bookmarks.title = "root"
      modified = true
    }

    // Проверяем наличие children у корневого элемента
    if (!bookmarks.children || !Array.isArray(bookmarks.children)) {
      console.log("Корневой элемент не имеет корректного children, добавляем")
      bookmarks.children = []
      modified = true
    }

    // Проверяем наличие папок верхнего уровня
    if (bookmarks.children.length === 0) {
      console.log("Нет папок верхнего уровня, добавляем стандартные папки")
      bookmarks.children.push(
        createDefaultFolder("Избранное"),
        createDefaultFolder("Работа"),
        createDefaultFolder("Личное")
      )
      modified = true
    }

    // Проверяем наличие type у папок верхнего уровня
    let hasFixedFolders = false
    const recursivelyFixFolders = (items) => {
      if (!items || !Array.isArray(items)) return

      for (let i = 0; i < items.length; i++) {
        const item = items[i]

        // Проверяем, что item существует и является объектом
        if (!item || typeof item !== "object") {
          console.log(
            `Элемент #${i} в массиве не является объектом, удаляем его`
          )
          items.splice(i, 1)
          i-- // Уменьшаем индекс, т.к. элемент удален
          hasFixedFolders = true
          continue
        }

        // Проверяем, что у объекта есть обязательные свойства
        if (!item.id) {
          console.log(
            `Элемент ${item.title || "без имени"} не имеет id, добавляем`
          )
          item.id =
            Date.now().toString(36) + Math.random().toString(36).substr(2)
          hasFixedFolders = true
        }

        // Определяем тип объекта, если он отсутствует
        if (!item.type) {
          if (item.url) {
            console.log(
              `Элемент ${
                item.title || "без имени"
              } не имеет type, но имеет URL, устанавливаем type='bookmark'`
            )
            item.type = "bookmark"
          } else if (item.children || Array.isArray(item.children)) {
            console.log(
              `Элемент ${
                item.title || "без имени"
              } не имеет type, но имеет children, устанавливаем type='folder'`
            )
            item.type = "folder"
          } else {
            console.log(
              `Элемент ${
                item.title || "без имени"
              } не имеет type и неясного типа, устанавливаем type='folder'`
            )
            item.type = "folder"
          }
          hasFixedFolders = true
        }

        // Проверяем, что папки имеют массив children
        if (
          item.type === "folder" &&
          (!item.children || !Array.isArray(item.children))
        ) {
          console.log(
            `Папка ${
              item.title || "без имени"
            } не имеет корректного children, добавляем пустой массив`
          )
          item.children = []
          hasFixedFolders = true
        }

        // Проверяем, что закладки имеют URL
        if (item.type === "bookmark" && !item.url) {
          console.log(
            `Закладка ${
              item.title || "без имени"
            } не имеет URL, добавляем заглушку`
          )
          item.url = "https://example.com/"
          hasFixedFolders = true
        }

        // Проверяем, что все элементы имеют заголовок
        if (!item.title) {
          console.log(
            `Элемент ${item.id} не имеет заголовка, добавляем заглушку`
          )
          item.title = item.type === "folder" ? "Папка" : "Закладка"
          hasFixedFolders = true
        }

        // Рекурсивно проверяем дочерние элементы
        if (item.children && Array.isArray(item.children)) {
          recursivelyFixFolders(item.children)
        }
      }
    }

    recursivelyFixFolders(bookmarks.children)

    if (hasFixedFolders) {
      modified = true
    }

    // Если были внесены изменения, сохраняем обновленную структуру
    if (modified) {
      console.log("Структура закладок исправлена, сохраняем изменения")
      await new Promise((resolve) =>
        chrome.storage.local.set({ gh_bookmarks: bookmarks }, resolve)
      )
      console.log("Структура закладок успешно обновлена")
      return true
    } else {
      console.log("Структура закладок корректна, изменения не требуются")
      return false
    }
  } catch (error) {
    console.error("Ошибка при исправлении структуры закладок:", error)

    // При критической ошибке создаем новую структуру с нуля
    console.log("Критическая ошибка, создаем новую структуру закладок")
    await initializeDefaultBookmarks()
    return true
  }
}

/**
 * Проверяет, является ли структура устаревшей или несовместимой
 * @param {Object} bookmarks - Структура закладок
 * @returns {boolean} - true, если структура устаревшая или несовместимая
 */
function isOldStructureFormat(bookmarks) {
  // Проверяем признаки старой структуры данных

  // Если корневой элемент не имеет id, type, title или children,
  // но при этом имеет другие свойства, считаем структуру устаревшей
  if (typeof bookmarks === "object" && Object.keys(bookmarks).length > 0) {
    const hasNewFormat =
      bookmarks.id &&
      bookmarks.type === "folder" &&
      bookmarks.title &&
      Array.isArray(bookmarks.children)

    if (!hasNewFormat) {
      // Проверяем, есть ли в структуре признаки старого формата
      const hasOldFormat =
        bookmarks.bookmarks || bookmarks.folders || bookmarks.version

      if (hasOldFormat) {
        console.log("[Background] Обнаружен устаревший формат данных")
        return true
      }
    }
  }

  return false
}

/**
 * Инициализирует базовую структуру закладок
 * @returns {Promise} Promise, который разрешается после инициализации
 */
async function initializeDefaultBookmarks() {
  console.log("[Background] Начинаем инициализацию базовой структуры закладок")

  try {
    // Создаем базовую структуру папок
    const defaultBookmarks = {
      id: "0",
      title: "root",
      type: "folder",
      children: [
        createDefaultFolder("Избранное"),
        createDefaultFolder("Работа"),
        createDefaultFolder("Личное"),
      ],
    }

    console.log(
      "[Background] Структура для сохранения:",
      JSON.stringify(defaultBookmarks)
    )

    // Проверяем структуру перед сохранением
    if (
      !defaultBookmarks.children ||
      !Array.isArray(defaultBookmarks.children)
    ) {
      console.error(
        "[Background] Критическая ошибка: children не является массивом перед сохранением"
      )
      defaultBookmarks.children = [
        createDefaultFolder("Избранное"),
        createDefaultFolder("Работа"),
        createDefaultFolder("Личное"),
      ]
    }

    // Сначала удаляем существующие данные
    await new Promise((resolve) =>
      chrome.storage.local.remove("gh_bookmarks", resolve)
    )

    // Сохраняем новую структуру
    await new Promise((resolve) =>
      chrome.storage.local.set({ gh_bookmarks: defaultBookmarks }, (result) => {
        const error = chrome.runtime.lastError
        if (error) {
          console.error("[Background] Ошибка при сохранении структуры:", error)
        } else {
          console.log("[Background] Структура успешно сохранена")
        }
        resolve()
      })
    )

    // Проверяем, что структура действительно сохранилась
    const data = await new Promise((resolve) =>
      chrome.storage.local.get("gh_bookmarks", resolve)
    )

    if (!data || !data.gh_bookmarks || !data.gh_bookmarks.children) {
      console.error(
        "[Background] Критическая ошибка: структура не сохранилась корректно"
      )
      return false
    }

    console.log(
      "[Background] Проверка созданной структуры:",
      "id:",
      data.gh_bookmarks.id,
      "children:",
      data.gh_bookmarks.children
        ? data.gh_bookmarks.children.length
        : "отсутствуют"
    )

    return true
  } catch (error) {
    console.error("[Background] Ошибка при инициализации закладок:", error)
    return false
  }
}

/**
 * Создает объект папки по умолчанию с уникальным ID
 * @param {string} title - Название папки
 * @returns {Object} - Объект папки
 */
function createDefaultFolder(title) {
  const folder = {
    id:
      "folder_" +
      Date.now().toString(36) +
      Math.random().toString(36).substr(2),
    title: title,
    type: "folder",
    children: [],
  }

  console.log("[Background] Создана папка по умолчанию:", title, folder.id)

  return folder
}

/**
 * Извлекает только папки из дерева закладок
 * @param {Array} items - Массив элементов закладок
 * @returns {Array} - Массив папок с сохранением иерархии
 */
function extractFolders(items) {
  // Безопасная проверка входных данных
  if (!items) {
    console.error("extractFolders: items is null or undefined")
    console.trace("Трассировка вызова extractFolders с null/undefined")
    return []
  }

  // Проверка, что items - массив
  if (!Array.isArray(items)) {
    console.error(
      "extractFolders: items не является массивом",
      typeof items,
      items
    )
    console.trace("Трассировка вызова extractFolders с не-массивом")

    // Если передан объект, возможно, это корневой объект закладок, попробуем извлечь папки из его children
    if (
      typeof items === "object" &&
      items !== null &&
      items.children &&
      Array.isArray(items.children)
    ) {
      console.log(
        "Извлекаем папки из children корневого объекта:",
        items.children.length
      )
      return extractFolders(items.children)
    }

    return []
  }

  console.log(
    `extractFolders: Обрабатываю ${items.length} элементов:`,
    JSON.stringify(items).substring(0, 300) + "..."
  )
  const folders = []

  // Проходим по всем элементам первого уровня
  for (const item of items) {
    // Пропускаем null и undefined
    if (!item) {
      console.warn("Пропускаем null/undefined элемент")
      continue
    }

    // Пропускаем не-объекты
    if (typeof item !== "object") {
      console.warn(`Пропускаем элемент с типом ${typeof item}`)
      continue
    }

    // Проверяем, является ли элемент папкой
    const isFolder =
      item.type === "folder" ||
      (item.children && Array.isArray(item.children)) ||
      (item.type === undefined && !item.url)

    if (isFolder) {
      console.log(
        `Найдена папка: ${item.title || "Без названия"} (ID: ${
          item.id || "без ID"
        })`
      )

      // Создаем копию папки
      const folder = {
        id:
          item.id ||
          Date.now().toString(36) + Math.random().toString(36).substr(2),
        title: item.title || "Папка",
        type: "folder",
        children: [],
      }

      // Если у папки есть иконка, сохраняем её
      if (item.icon) {
        folder.icon = item.icon
      }

      // Рекурсивно извлекаем вложенные папки из всех дочерних элементов
      if (
        item.children &&
        Array.isArray(item.children) &&
        item.children.length > 0
      ) {
        console.log(
          `Папка ${folder.title} имеет ${item.children.length} дочерних элементов`
        )

        try {
          // Рекурсивно извлекаем структуру вложенных папок
          folder.children = extractFolders(item.children)
          console.log(
            `Извлечено ${folder.children.length} вложенных папок для ${folder.title}`
          )
        } catch (error) {
          console.error(
            `Ошибка при извлечении вложенных папок для ${folder.title}:`,
            error
          )
          folder.children = [] // Устанавливаем пустой массив в случае ошибки
        }
      }

      folders.push(folder)
    }
  }

  console.log(`extractFolders: Найдено ${folders.length} папок`)
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
  console.log(
    `Поиск папки с ID ${folderId} для добавления закладки ${bookmark.title}`
  )

  if (!items || !Array.isArray(items)) {
    console.error("addBookmarkToFolder: items не является массивом", items)
    return { success: false, error: "Некорректная структура закладок" }
  }

  // Проходим по всем элементам
  for (const item of items) {
    // Проверяем, является ли текущий элемент искомой папкой
    if (item.id === folderId && item.type === "folder") {
      console.log(`Найдена папка ${item.title} (ID: ${item.id})`)

      // Проверяем, инициализировано ли свойство children
      if (!item.children) {
        console.log(`Инициализируем массив children для папки ${item.title}`)
        item.children = []
      }

      // Проверяем, что children - это массив
      if (!Array.isArray(item.children)) {
        console.error(
          `Свойство children папки ${item.title} не является массивом`
        )
        return { success: false, error: "Некорректная структура папки" }
      }

      // Добавляем закладку в папку
      item.children.push(bookmark)
      console.log(
        `Закладка ${bookmark.title} успешно добавлена в папку ${item.title}`
      )
      return { success: true }
    }

    // Если у текущего элемента есть дочерние элементы, рекурсивно ищем в них
    if (
      item.children &&
      Array.isArray(item.children) &&
      item.children.length > 0
    ) {
      const result = addBookmarkToFolder(item.children, folderId, bookmark)
      if (result.success) {
        return result
      }
    }
  }

  console.warn(`Папка с ID ${folderId} не найдена`)
  return { success: false, error: "Папка не найдена" }
}

/**
 * Создает папку в структуре закладок
 * @param {Object} bookmarks - Структура закладок
 * @param {string} parentId - ID родительской папки
 * @param {string} title - Название новой папки
 * @param {Function} sendResponse - Функция для отправки ответа
 */
function createFolderInStructure(bookmarks, parentId, title, sendResponse) {
  try {
    // Создаем новую папку
    const newFolder = createDefaultFolder(title)
    console.log(`Создана новая папка: ${title} с ID: ${newFolder.id}`)

    // Если parentId === "0", добавляем папку в корень
    if (parentId === "0") {
      if (!bookmarks.children) {
        bookmarks.children = []
      }

      bookmarks.children.push(newFolder)
      console.log(`Папка ${title} добавлена в корневую папку`)

      // Сохраняем обновленную структуру
      chrome.storage.local.set({ gh_bookmarks: bookmarks }, () => {
        if (chrome.runtime.lastError) {
          console.error(
            "Ошибка при сохранении папки:",
            chrome.runtime.lastError
          )
          sendResponse({
            success: false,
            error: chrome.runtime.lastError.message,
          })
        } else {
          console.log("Папка успешно сохранена")
          sendResponse({
            success: true,
            folder: newFolder,
          })
        }
      })
    } else {
      // Добавляем папку во вложенную папку
      const result = addFolderToFolder(bookmarks.children, parentId, newFolder)

      if (!result.success) {
        console.error("Не удалось добавить папку:", result.error)
        sendResponse({ success: false, error: result.error })
        return
      }

      // Сохраняем обновленную структуру
      chrome.storage.local.set({ gh_bookmarks: bookmarks }, () => {
        if (chrome.runtime.lastError) {
          console.error(
            "Ошибка при сохранении папки:",
            chrome.runtime.lastError
          )
          sendResponse({
            success: false,
            error: chrome.runtime.lastError.message,
          })
        } else {
          console.log("Папка успешно сохранена")
          sendResponse({
            success: true,
            folder: newFolder,
          })
        }
      })
    }
  } catch (error) {
    console.error("Ошибка при создании папки:", error)
    sendResponse({ success: false, error: error.message })
  }
}

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
