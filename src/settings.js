import { initTheme } from "./utils/theme.js"
import { importFromBrowser } from "./utils/bookmarks.js"
import { getStoredBookmarks, saveBookmarks } from "./utils/storage.js"

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

  // Обработчик импорта из файла
  const importFromFileButton = document.getElementById("importFromFile")
  importFromFileButton.addEventListener("click", () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".html"
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (file) {
        importBookmarksFromFile(file)
      }
    }
    input.click()
  })
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

// Функция импорта закладок из HTML файла
async function importBookmarksFromFile(file) {
  try {
    const content = await readFileContent(file)
    const bookmarks = parseBookmarksHTML(content)
    await saveBookmarks(bookmarks)
    alert("Закладки успешно импортированы из файла!")
  } catch (error) {
    console.error("Ошибка при импорте закладок из файла:", error)
    alert("Произошла ошибка при импорте закладок из файла")
  }
}

// Функция чтения содержимого файла
function readFileContent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => resolve(event.target.result)
    reader.onerror = (error) => reject(error)
    reader.readAsText(file)
  })
}

// Функция парсинга HTML файла с закладками
function parseBookmarksHTML(html) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")

  function processNode(node) {
    const items = []

    // Перебираем все DT элементы
    const dtElements = node.querySelectorAll(":scope > DT")

    dtElements.forEach((dt) => {
      const link = dt.querySelector(":scope > A")
      const h3 = dt.querySelector(":scope > H3")

      if (link) {
        // Это закладка
        items.push({
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: link.textContent,
          url: link.href,
          type: "bookmark",
        })
      } else if (h3) {
        // Это папка
        const dl = dt.querySelector(":scope > DL")
        const folderId =
          Date.now().toString(36) + Math.random().toString(36).substr(2)

        const folder = {
          id: folderId,
          title: h3.textContent,
          type: "folder",
          children: dl ? processNode(dl) : [],
        }

        items.push(folder)
      }
    })

    return items
  }

  const rootDL = doc.querySelector("DL")
  return rootDL ? processNode(rootDL) : []
}
