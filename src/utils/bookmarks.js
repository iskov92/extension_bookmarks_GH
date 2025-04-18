import {
  getStoredBookmarks,
  createStoredBookmark,
  getBookmarksFromFolder,
  saveBookmarks,
} from "./storage.js"

// Получить все закладки
export async function getAllBookmarks() {
  return await getStoredBookmarks()
}

// Создать новую закладку
export async function createBookmark(parentId, title, url = "") {
  return await createStoredBookmark(parentId, title, url)
}

// Создать новую папку
export async function createFolder(parentId, title) {
  return await createStoredBookmark(parentId, title)
}

// Получить закладки из папки
export async function getBookmarksInFolder(folderId) {
  return await getBookmarksFromFolder(folderId)
}

// Импортировать закладки из браузера
export async function importFromBrowser() {
  try {
    // Получаем закладки из браузера
    const browserBookmarks = await chrome.bookmarks.getTree()
    const processedBookmarks = await processBookmarkTree(
      browserBookmarks[0].children
    )
    await saveBookmarks(processedBookmarks)
    return true
  } catch (error) {
    console.error("Ошибка при импорте закладок из браузера:", error)
    return false
  }
}

// Рекурсивно обработать дерево закладок
async function processBookmarkTree(bookmarks) {
  const processedBookmarks = []

  for (const bookmark of bookmarks) {
    const newBookmark = {
      id: generateUniqueId(),
      title: bookmark.title,
      type: bookmark.url ? "bookmark" : "folder",
    }

    if (bookmark.url) {
      newBookmark.url = bookmark.url
      try {
        // Получаем favicon для URL
        const response = await fetch(bookmark.url)
        const text = await response.text()
        const parser = new DOMParser()
        const doc = parser.parseFromString(text, "text/html")

        const links = Array.from(doc.getElementsByTagName("link"))
        const faviconLink = links.find(
          (link) =>
            link.rel.toLowerCase().includes("icon") ||
            link.href.toLowerCase().includes("favicon")
        )

        if (faviconLink) {
          newBookmark.favicon = new URL(faviconLink.href, bookmark.url).href
        } else {
          // Пробуем стандартный путь
          const defaultFavicon = new URL("/favicon.ico", bookmark.url).href
          const defaultResponse = await fetch(defaultFavicon)
          if (defaultResponse.ok) {
            newBookmark.favicon = defaultFavicon
          } else {
            newBookmark.favicon = "./assets/icons/default_favicon.png"
          }
        }
      } catch (error) {
        console.error("Ошибка при получении favicon для", bookmark.url, error)
        newBookmark.favicon = "./assets/icons/default_favicon.png"
      }
    } else {
      newBookmark.children = await processBookmarkTree(bookmark.children || [])
    }

    processedBookmarks.push(newBookmark)
  }

  return processedBookmarks
}

function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// Экспортировать закладки в HTML
export async function exportBookmarksToHTML() {
  try {
    const bookmarks = await getStoredBookmarks()
    return generateBookmarksHTML(bookmarks)
  } catch (error) {
    console.error("Ошибка при экспорте закладок:", error)
    return ""
  }
}

// Сгенерировать HTML для закладок
function generateBookmarksHTML(bookmarks, level = 0) {
  let html =
    level === 0
      ? '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n'
      : ""

  for (const bookmark of bookmarks) {
    const indent = "    ".repeat(level + 1)

    if (bookmark.url) {
      html += `${indent}<DT><A HREF="${bookmark.url}">${bookmark.title}</A>\n`
    } else {
      html += `${indent}<DT><H3>${bookmark.title}</H3>\n${indent}<DL><p>\n`
      html += generateBookmarksHTML(bookmark.children || [], level + 1)
      html += `${indent}</DL><p>\n`
    }
  }

  if (level === 0) {
    html += "</DL><p>"
  }

  return html
}
