export async function getAllBookmarks() {
  try {
    const tree = await chrome.bookmarks.getTree()
    return tree[0].children
  } catch (error) {
    console.error("Ошибка при получении закладок:", error)
    return []
  }
}

export async function createBookmark(parentId, title, url = "") {
  try {
    const bookmark = await chrome.bookmarks.create({
      parentId,
      title,
      url,
    })
    return bookmark
  } catch (error) {
    console.error("Ошибка при создании закладки:", error)
    throw error
  }
}

export async function createFolder(parentId, title) {
  return createBookmark(parentId, title)
}

export function exportBookmarksToHTML(bookmarks) {
  let html = "<!DOCTYPE NETSCAPE-Bookmark-file-1>\n"
  html +=
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n'
  html += "<TITLE>Bookmarks</TITLE>\n"
  html += "<H1>Bookmarks</H1>\n"
  html += "<DL><p>\n"

  function processBookmarks(items, level = 1) {
    const indent = "    ".repeat(level)

    for (const item of items) {
      if (item.url) {
        html += `${indent}<DT><A HREF="${item.url}">${item.title}</A>\n`
      } else {
        html += `${indent}<DT><H3>${item.title}</H3>\n`
        html += `${indent}<DL><p>\n`
        if (item.children) {
          processBookmarks(item.children, level + 1)
        }
        html += `${indent}</DL><p>\n`
      }
    }
  }

  processBookmarks(bookmarks)
  html += "</DL><p>"

  return html
}

