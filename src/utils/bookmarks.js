import {
  getStoredBookmarks,
  createStoredBookmark,
  getBookmarksFromFolder,
  saveBookmarks,
  storage,
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
      // Используем chrome://favicon/ для получения иконки
      newBookmark.favicon = `chrome://favicon/size/16@2x/${bookmark.url}`
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

/**
 * Обновляет существующую закладку или папку
 * @param {string} id - ID закладки/папки
 * @param {Object} data - Новые данные (title, url)
 */
export async function updateBookmark(id, data) {
  const bookmarks = (await storage.get("gh_bookmarks")) || []

  // Если есть URL, проверяем и добавляем протокол если нужно
  if (data.url) {
    // Убираем пробелы в начале и конце
    data.url = data.url.trim()

    // Проверяем наличие протокола
    if (!data.url.match(/^https?:\/\//i)) {
      // Если нет протокола, добавляем https://
      data.url = `https://${data.url}`
    }

    // Обновляем favicon для нового URL
    data.favicon = `chrome://favicon/size/16@2x/${data.url}`
  }

  function updateInTree(items) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) {
        items[i] = { ...items[i], ...data }
        return true
      }
      if (items[i].type === "folder" && items[i].children) {
        if (updateInTree(items[i].children)) {
          return true
        }
      }
    }
    return false
  }

  updateInTree(bookmarks)
  await storage.set("gh_bookmarks", bookmarks)
}

/**
 * Удаляет закладку или папку
 * @param {string} id - ID закладки/папки
 */
export async function deleteBookmark(id) {
  const bookmarks = (await storage.get("gh_bookmarks")) || []

  function deleteFromTree(items) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) {
        items.splice(i, 1)
        return true
      }
      if (items[i].type === "folder" && items[i].children) {
        if (deleteFromTree(items[i].children)) {
          return true
        }
      }
    }
    return false
  }

  deleteFromTree(bookmarks)
  await storage.set("gh_bookmarks", bookmarks)
}

/**
 * Копирует папку или закладку
 * @param {string} id - ID исходной папки/закладки
 * @param {string} parentId - ID целевой родительской папки
 */
export async function copyBookmark(id) {
  const bookmarks = (await storage.get("gh_bookmarks")) || []

  function findInTree(items) {
    for (const item of items) {
      if (item.id === id) {
        return item
      }
      if (item.type === "folder" && item.children) {
        const found = findInTree(item.children)
        if (found) return found
      }
    }
    return null
  }

  function generateNewId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }

  function deepClone(item) {
    const clone = { ...item, id: generateNewId() }
    if (item.type === "folder" && item.children) {
      clone.children = item.children.map((child) => deepClone(child))
    }
    return clone
  }

  const itemToCopy = findInTree(bookmarks)
  if (!itemToCopy) return null

  const copy = deepClone(itemToCopy)
  copy.title = `${copy.title} (копия)`

  bookmarks.push(copy)
  await storage.set("gh_bookmarks", bookmarks)
  return copy
}
