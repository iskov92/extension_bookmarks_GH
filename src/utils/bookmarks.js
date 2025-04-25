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

    // Получаем содержимое корневой папки (обычно это первый элемент)
    const rootFolder = browserBookmarks[0]

    // Находим системные папки (обычно это "Панель закладок" и "Другие закладки")
    const systemFolders = rootFolder.children || []

    // Собираем все закладки из системных папок в один массив
    let allBookmarks = []
    for (const folder of systemFolders) {
      if (folder.children) {
        const processedBookmarks = await processBookmarkTree(folder.children)
        allBookmarks = [...allBookmarks, ...processedBookmarks]
      }
    }

    await saveBookmarks(allBookmarks)
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
    // Пропускаем пустые папки и закладки без названия
    if (!bookmark.title.trim()) continue

    const newBookmark = {
      id: generateUniqueId(),
      title: bookmark.title,
      type: bookmark.url ? "bookmark" : "folder",
    }

    if (bookmark.url) {
      newBookmark.url = bookmark.url
      // Используем chrome://favicon/ для получения иконки
      newBookmark.favicon = `chrome://favicon/size/16@2x/${bookmark.url}`
    } else if (bookmark.children && bookmark.children.length > 0) {
      // Добавляем папку только если в ней есть содержимое
      newBookmark.children = await processBookmarkTree(bookmark.children)
      // Если после обработки в папке нет содержимого, пропускаем её
      if (newBookmark.children.length === 0) continue
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
export async function deleteBookmark(bookmarkId) {
  try {
    const bookmarks = await getStoredBookmarks()

    function deleteFromTree(items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]

        if (item.id === bookmarkId) {
          items.splice(i, 1)
          return true
        }

        if (item.children && item.children.length > 0) {
          const deleted = deleteFromTree(item.children)
          if (deleted) {
            if (item.children.length === 0) {
              delete item.children
            }
            return true
          }
        }
      }
      return false
    }

    const deleted = deleteFromTree(bookmarks)
    if (deleted) {
      await saveBookmarks(bookmarks)
      return true
    }
    return false
  } catch (error) {
    console.error("Ошибка при удалении закладки:", error)
    return false
  }
}

/**
 * Копирует папку или закладку
 * @param {string} id - ID исходной папки/закладки
 * @param {string} parentId - ID целевой родительской папки
 */
export async function copyBookmark(id, parentId = "0") {
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

  function findParentFolder(items, targetId) {
    for (const item of items) {
      if (item.id === targetId) {
        return item
      }
      if (item.type === "folder" && item.children) {
        const found = findParentFolder(item.children, targetId)
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

  // Если parentId === "0", добавляем в корневой список
  if (parentId === "0") {
    bookmarks.push(copy)
  } else {
    // Иначе ищем целевую папку и добавляем в неё
    const targetFolder = findParentFolder(bookmarks, parentId)
    if (targetFolder) {
      if (!targetFolder.children) {
        targetFolder.children = []
      }
      targetFolder.children.push(copy)
    } else {
      // Если папка не найдена, добавляем в корень
      bookmarks.push(copy)
    }
  }

  await storage.set("gh_bookmarks", bookmarks)
  return copy
}

/**
 * Обновляет папку в локальном хранилище
 * @param {string} id - ID папки
 * @param {Object} data - Данные для обновления {title: string, iconUrl?: string}
 */
export async function updateFolder(id, data) {
  try {
    const bookmarks = (await storage.get("gh_bookmarks")) || []

    function updateInTree(items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].id === id) {
          // Обновляем название папки
          if (data.title) {
            items[i].title = data.title
          }
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

    // Сохраняем иконку отдельно
    if (data.iconUrl) {
      await storage.set(`folder_icon_${id}`, data.iconUrl)
    }

    return true
  } catch (error) {
    console.error("Ошибка при обновлении папки:", error)
    throw error
  }
}

/**
 * Перемещает закладку или папку в другую папку
 * @param {string} itemId - ID перемещаемого элемента
 * @param {string} targetFolderId - ID целевой папки
 * @returns {Promise<boolean>} - Успешно ли выполнено перемещение
 */
export async function moveBookmark(itemId, targetFolderId) {
  try {
    // Если пытаемся переместить в тот же родительский элемент, ничего не делаем
    if (itemId === targetFolderId) {
      return false
    }

    const bookmarks = await getStoredBookmarks()

    // Проверка на перемещение в подпапку (предотвращаем циклическую ссылку)
    if (isChildFolder(bookmarks, itemId, targetFolderId)) {
      console.error("Нельзя переместить папку в её собственную подпапку")
      return false
    }

    // Найти и извлечь перемещаемый элемент
    let itemToMove = null
    let sourceParentPath = []

    function findAndExtractItem(items, parentPath = []) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].id === itemId) {
          itemToMove = items[i]
          sourceParentPath = [...parentPath]
          items.splice(i, 1)
          return true
        }
        if (items[i].type === "folder" && items[i].children) {
          if (
            findAndExtractItem(items[i].children, [...parentPath, items[i]])
          ) {
            return true
          }
        }
      }
      return false
    }

    findAndExtractItem(bookmarks)

    if (!itemToMove) {
      console.error("Элемент для перемещения не найден")
      return false
    }

    // Добавить элемент в целевую папку
    if (targetFolderId === "0") {
      // Если перемещаем в корень
      bookmarks.push(itemToMove)
    } else {
      function addToTargetFolder(items) {
        for (const item of items) {
          if (item.id === targetFolderId) {
            item.children = item.children || []
            item.children.push(itemToMove)
            return true
          }
          if (item.type === "folder" && item.children) {
            if (addToTargetFolder(item.children)) {
              return true
            }
          }
        }
        return false
      }

      if (!addToTargetFolder(bookmarks)) {
        // Если целевая папка не найдена, возвращаем элемент на прежнее место
        if (sourceParentPath.length === 0) {
          bookmarks.push(itemToMove)
        } else {
          let parent = bookmarks
          for (const folder of sourceParentPath) {
            parent = parent.find((item) => item.id === folder.id)?.children
            if (!parent) break
          }
          if (parent) parent.push(itemToMove)
        }
        console.error("Целевая папка не найдена")
        return false
      }
    }

    await saveBookmarks(bookmarks)
    return true
  } catch (error) {
    console.error("Ошибка при перемещении закладки:", error)
    return false
  }
}

/**
 * Проверяет, является ли потенциальная целевая папка подпапкой исходной папки
 * @param {Array} bookmarks - Массив закладок
 * @param {string} sourceId - ID исходной папки
 * @param {string} targetId - ID целевой папки
 * @returns {boolean} - true если целевая папка является подпапкой исходной
 */
function isChildFolder(bookmarks, sourceId, targetId) {
  // Рекурсивно проверяем, является ли targetId подпапкой sourceId
  function checkInFolder(items) {
    // Находим исходную папку
    const sourceFolder = findFolderById(items, sourceId)
    if (!sourceFolder || sourceFolder.type !== "folder") {
      return false
    }

    // Проверяем, содержит ли исходная папка целевую папку
    function isDescendant(folder) {
      if (!folder.children) return false

      for (const child of folder.children) {
        if (child.id === targetId) {
          return true
        }
        if (child.type === "folder" && isDescendant(child)) {
          return true
        }
      }
      return false
    }

    return isDescendant(sourceFolder)
  }

  return checkInFolder(bookmarks)
}

/**
 * Находит папку по ID в дереве закладок
 * @param {Array} bookmarks - Массив закладок
 * @param {string} folderId - ID папки для поиска
 * @returns {Object|null} - Найденная папка или null
 */
function findFolderById(bookmarks, folderId) {
  for (const bookmark of bookmarks) {
    if (bookmark.id === folderId) {
      return bookmark
    }
    if (bookmark.type === "folder" && bookmark.children) {
      const found = findFolderById(bookmark.children, folderId)
      if (found) return found
    }
  }
  return null
}

/**
 * Меняет порядок закладок в указанной папке
 * @param {string} sourceId - ID перемещаемого элемента
 * @param {string} targetId - ID элемента, рядом с которым нужно вставить
 * @param {string} parentId - ID родительской папки
 * @returns {Promise<boolean>} - Успешно ли выполнена операция
 */
export async function reorderBookmarks(sourceId, targetId, parentId) {
  if (!sourceId || !targetId) {
    console.error("reorderBookmarks: sourceId или targetId отсутствуют")
    return false
  }

  if (sourceId === targetId) {
    console.log(
      "reorderBookmarks: исходный и целевой элементы совпадают, операция отменена"
    )
    return false
  }

  try {
    const bookmarks = await getStoredBookmarks()

    // Находим родительскую папку
    let targetFolder = bookmarks
    if (parentId !== "0") {
      function findFolder(items) {
        for (const item of items) {
          if (item.id === parentId) {
            return item.children || []
          }
          if (item.type === "folder" && item.children) {
            const found = findFolder(item.children)
            if (found.length > 0) return found
          }
        }
        return []
      }
      targetFolder = findFolder(bookmarks)
    }

    // Проверяем, что оба элемента находятся в целевой папке
    const sourceIndex = targetFolder.findIndex((item) => item.id === sourceId)
    const targetIndex = targetFolder.findIndex((item) => item.id === targetId)

    if (sourceIndex === -1) {
      console.error(
        `reorderBookmarks: элемент с ID ${sourceId} не найден в выбранной папке`
      )
      return false
    }

    if (targetIndex === -1) {
      console.error(
        `reorderBookmarks: элемент с ID ${targetId} не найден в выбранной папке`
      )
      return false
    }

    // Извлекаем перемещаемый элемент
    const [movedItem] = targetFolder.splice(sourceIndex, 1)

    // Определяем новую позицию (учитывая смещение индексов после удаления)
    const newIndex = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex

    // Вставляем элемент на новую позицию
    targetFolder.splice(newIndex, 0, movedItem)

    // Сохраняем изменения
    await saveBookmarks(bookmarks)

    console.log(
      `reorderBookmarks: элемент успешно перемещен с позиции ${sourceIndex} на ${newIndex}`
    )
    return true
  } catch (error) {
    console.error(
      "reorderBookmarks: ошибка при изменении порядка закладок",
      error
    )
    return false
  }
}

/**
 * Проверяет, является ли папка потомком (непосредственным или вложенным) другой папки
 * @param {string} parentId - ID предполагаемой родительской папки
 * @param {string} childId - ID предполагаемой дочерней папки
 * @returns {Promise<boolean>} - true, если childId является потомком parentId
 */
async function isChildOf(parentId, childId) {
  try {
    // Если ID совпадают, это одна и та же папка
    if (parentId === childId) {
      return false
    }

    const bookmarks = await getStoredBookmarks()

    // Рекурсивно проверяем, содержится ли childId внутри parentId
    function checkIsChild(items, targetId) {
      for (const item of items) {
        if (item.id === targetId) {
          return true
        }
        if (
          item.type === "folder" &&
          item.children &&
          item.children.length > 0
        ) {
          if (checkIsChild(item.children, targetId)) {
            return true
          }
        }
      }
      return false
    }

    // Находим родительскую папку
    function findFolder(items, id) {
      for (const item of items) {
        if (item.id === id) {
          return item
        }
        if (
          item.type === "folder" &&
          item.children &&
          item.children.length > 0
        ) {
          const folder = findFolder(item.children, id)
          if (folder) {
            return folder
          }
        }
      }
      return null
    }

    const parentFolder = findFolder(bookmarks, parentId)
    if (
      !parentFolder ||
      parentFolder.type !== "folder" ||
      !parentFolder.children
    ) {
      return false
    }

    return checkIsChild(parentFolder.children, childId)
  } catch (error) {
    console.error("isChildOf: ошибка при проверке вложенности папок", error)
    return false
  }
}
