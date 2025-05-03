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
        resolve(result[key])
      })
    })
  }

  async set(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve()
      })
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
        newBookmark.favicon = await getFavicon(url)
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
async function getFavicon(url) {
  try {
    // Используем Google Favicon Service
    const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
      url
    )}&sz=32`

    // Проверяем доступность favicon
    const response = await fetch(googleFaviconUrl)
    if (response.ok) {
      return googleFaviconUrl
    }

    // Если не удалось получить через Google, пробуем получить напрямую с сайта
    const siteResponse = await fetch(url)
    const text = await siteResponse.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, "text/html")

    // Ищем favicon в разных местах
    const links = Array.from(doc.getElementsByTagName("link"))
    const faviconLink = links.find(
      (link) =>
        link.rel.toLowerCase().includes("icon") ||
        link.href.toLowerCase().includes("favicon")
    )

    if (faviconLink) {
      const faviconUrl = new URL(faviconLink.href, url).href
      return faviconUrl
    }

    // Если не нашли, возвращаем дефолтную иконку
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
