// Ключ для хранения закладок в storage.local
const BOOKMARKS_STORAGE_KEY = "gh_bookmarks"

// Получить все закладки из storage.local
export async function getStoredBookmarks() {
  try {
    const data = await chrome.storage.local.get(BOOKMARKS_STORAGE_KEY)
    return data[BOOKMARKS_STORAGE_KEY]?.children || []
  } catch (error) {
    console.error("Ошибка при получении закладок из хранилища:", error)
    return []
  }
}

// Сохранить закладки в storage.local
export async function saveBookmarks(bookmarks) {
  try {
    await chrome.storage.local.set({
      [BOOKMARKS_STORAGE_KEY]: {
        id: "0",
        title: "root",
        children: bookmarks,
      },
    })
  } catch (error) {
    console.error("Ошибка при сохранении закладок в хранилище:", error)
    throw error
  }
}

// Получить закладки из определенной папки
export async function getBookmarksFromFolder(folderId) {
  try {
    const allBookmarks = await getStoredBookmarks()
    return findFolderById(allBookmarks, folderId)?.children || []
  } catch (error) {
    console.error("Ошибка при получении закладок из папки:", error)
    return []
  }
}

// Создать новую закладку
export async function createStoredBookmark(
  parentId,
  title,
  url = "",
  favicon = ""
) {
  try {
    const allBookmarks = await getStoredBookmarks()
    const newBookmark = {
      id: generateUniqueId(),
      title,
      url,
      favicon: favicon || (url ? await getFavicon(url) : ""),
      type: url ? "bookmark" : "folder",
      children: url ? undefined : [],
    }

    const updatedBookmarks = addBookmarkToFolder(
      allBookmarks,
      parentId,
      newBookmark
    )
    await saveBookmarks(updatedBookmarks)
    return newBookmark
  } catch (error) {
    console.error("Ошибка при создании закладки:", error)
    throw error
  }
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
