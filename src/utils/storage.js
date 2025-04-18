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
  const bookmarks = await getStoredBookmarks()
  const newBookmark = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    title,
    type: url ? "bookmark" : "folder",
    children: [],
  }

  if (url) {
    newBookmark.url = url
    newBookmark.favicon = `chrome://favicon/size/16@2x/${url}`
  }

  if (parentId === "0") {
    bookmarks.push(newBookmark)
  } else {
    function addToFolder(items) {
      for (const item of items) {
        if (item.id === parentId) {
          item.children = item.children || []
          item.children.push(newBookmark)
          return true
        }
        if (item.type === "folder" && item.children) {
          if (addToFolder(item.children)) {
            return true
          }
        }
      }
      return false
    }
    addToFolder(bookmarks)
  }

  await storage.set("gh_bookmarks", bookmarks)
  return newBookmark
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
    const response = await fetch(url)
    const text = await response.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, "text/html")

    // Пытаемся найти favicon в разных местах
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

    // Если не нашли, пробуем стандартный путь
    const defaultFavicon = new URL("/favicon.ico", url).href
    const defaultResponse = await fetch(defaultFavicon)
    if (defaultResponse.ok) {
      return defaultFavicon
    }

    // Если ничего не нашли, возвращаем дефолтную иконку
    return "./assets/icons/default_favicon.png"
  } catch (error) {
    console.error("Ошибка при получении favicon:", error)
    return "./assets/icons/default_favicon.png"
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
