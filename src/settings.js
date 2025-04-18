import { initTheme } from "./utils/theme.js"
import { importFromBrowser } from "./utils/bookmarks.js"
import { getStoredBookmarks } from "./utils/storage.js"

// Инициализация UI
document.addEventListener("DOMContentLoaded", () => {
  // Инициализируем тему
  initTheme()

  // Обработчик кнопки "Назад"
  const backButton = document.getElementById("backButton")
  backButton.addEventListener("click", () => {
    window.location.href = "popup.html"
  })

  // Обработчик импорта закладок
  const importButton = document.getElementById("importBookmarks")
  importButton.addEventListener("click", importBookmarksFromBrowser)

  // Обработчик экспорта закладок
  const exportButton = document.getElementById("exportBookmarks")
  exportButton.addEventListener("click", exportBookmarksToFile)
})

// Функция импорта закладок из браузера
async function importBookmarksFromBrowser() {
  try {
    await importFromBrowser()
    alert("Закладки успешно импортированы!")
  } catch (error) {
    console.error("Ошибка при импорте закладок:", error)
    alert("Произошла ошибка при импорте закладок")
  }
}

// Функция экспорта закладок в файл
async function exportBookmarksToFile() {
  try {
    const bookmarks = await getStoredBookmarks()

    if (!bookmarks || bookmarks.length === 0) {
      alert("Нет сохраненных закладок для экспорта")
      return
    }

    // Создаем HTML файл с закладками
    const html = generateBookmarksHTML(bookmarks)

    // Создаем Blob и скачиваем файл
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = "gh_bookmarks.html"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    alert("Закладки успешно экспортированы!")
  } catch (error) {
    console.error("Ошибка при экспорте закладок:", error)
    alert("Произошла ошибка при экспорте закладок")
  }
}

// Функция генерации HTML файла с закладками
function generateBookmarksHTML(bookmarks) {
  const header = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>`

  const footer = "</DL><p>"

  function generateBookmarkItem(item, indent = "") {
    if (item.type === "folder") {
      let html = `${indent}<DT><H3>${item.title}</H3>\n${indent}<DL><p>\n`
      item.children.forEach((child) => {
        html += generateBookmarkItem(child, indent + "    ")
      })
      html += `${indent}</DL><p>\n`
      return html
    } else {
      return `${indent}<DT><A HREF="${item.url}">${item.title}</A>\n`
    }
  }

  let content = ""
  bookmarks.forEach((item) => {
    content += generateBookmarkItem(item, "    ")
  })

  return header + content + footer
}
