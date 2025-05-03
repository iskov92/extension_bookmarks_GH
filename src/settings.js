import { initTheme } from "./utils/theme.js"
import { importFromBrowser, exportBookmarksToHTML } from "./utils/bookmarks.js"
import {
  getStoredBookmarks,
  saveBookmarks,
  getFaviconsEnabled,
  setFaviconsEnabled,
  updateAllFavicons,
  clearAllFavicons,
} from "./utils/storage.js"
import { i18n } from "./utils/i18n.js"

// Инициализация UI
document.addEventListener("DOMContentLoaded", async () => {
  // Инициализируем тему
  initTheme()

  // Инициализируем язык
  await i18n.initLocale()
  updateLanguageToggle()
  translatePage()

  // Обработчик кнопки "Назад"
  const backButton = document.getElementById("backButton")
  backButton.addEventListener("click", () => {
    chrome.storage.local.get(["navigationState"], (result) => {
      if (result.navigationState && result.navigationState.stack) {
        const path = encodeURIComponent(
          JSON.stringify(result.navigationState.stack)
        )
        // Удаляем сохраненное состояние после использования
        chrome.storage.local.remove("navigationState")
        window.location.href = `popup.html?path=${path}`
      } else {
        window.location.href = "popup.html"
      }
    })
  })

  // Обработчик переключения языка
  const languageToggle = document.getElementById("languageToggle")
  languageToggle.addEventListener("change", async () => {
    const newLocale = languageToggle.checked ? "en" : "ru"
    await i18n.setLocale(newLocale)
    translatePage()
  })

  // Обработчик переключения темы
  const themeToggle = document.getElementById("themeToggle")
  themeToggle.addEventListener("change", handleThemeToggle)

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

  // Инициализация переключателя фавиконов и его обработчика
  initFaviconToggle()
})

// Обновление состояния переключателя языка
function updateLanguageToggle() {
  const languageToggle = document.getElementById("languageToggle")
  languageToggle.checked = i18n.currentLocale === "en"
}

// Перевод всех элементов на странице
function translatePage() {
  const elements = document.querySelectorAll("[data-translate]")
  elements.forEach((element) => {
    const key = element.dataset.translate
    element.textContent = i18n.t(key)
  })
}

// Обработчик переключения темы
function handleThemeToggle(e) {
  const isDark = e.target.checked
  const theme = isDark ? "dark" : "light"
  document.body.setAttribute("data-theme", theme)
  chrome.storage.local.set({ isDarkTheme: isDark })
}

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
    // Используем встроенную функцию экспорта из bookmarks.js
    const html = await exportBookmarksToHTML()

    if (!html) {
      alert("Нет сохраненных закладок для экспорта")
      return
    }

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
      const noteElement = dt.querySelector(":scope > EXT-NOTE")

      if (link) {
        // Это закладка
        items.push({
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: link.textContent,
          url: link.href,
          type: "bookmark",
        })
      } else if (noteElement) {
        // Это заметка
        const title = noteElement.getAttribute("TITLE") || "Заметка"
        const createdAt = parseInt(
          noteElement.getAttribute("CREATED_AT") || Date.now()
        )
        // Получаем содержимое заметки (весь текст внутри EXT-NOTE)
        const content = noteElement.textContent.trim()

        items.push({
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: title,
          content: content,
          createdAt: createdAt,
          type: "note",
        })
      } else if (h3) {
        const folderTitle = h3.textContent
        const dl = dt.querySelector(":scope > DL")

        // Если это стандартная папка браузера ("Панель закладок" или "Другие закладки"),
        // добавляем её содержимое напрямую в корневой уровень
        if (
          folderTitle === "Панель закладок" ||
          folderTitle === "Другие закладки"
        ) {
          if (dl) {
            const nestedItems = processNode(dl)
            items.push(...nestedItems)
          }
        } else {
          // Для остальных папок сохраняем структуру как есть
          const folderId =
            Date.now().toString(36) + Math.random().toString(36).substr(2)
          const folder = {
            id: folderId,
            title: folderTitle,
            type: "folder",
            children: dl ? processNode(dl) : [],
          }
          items.push(folder)
        }
      }
    })

    return items
  }

  const rootDL = doc.querySelector("DL")
  return rootDL ? processNode(rootDL) : []
}

// Инициализация переключателя фавиконов
async function initFaviconToggle() {
  const faviconToggle = document.getElementById("faviconToggle")
  const loadingIndicator = document.querySelector(".favicon-loading-indicator")
  const toggleStatus = document.querySelector(".toggle-status")

  try {
    // Получаем текущее состояние из хранилища
    const isEnabled = await getFaviconsEnabled()
    console.log("Текущее состояние фавиконов:", isEnabled)

    // Устанавливаем состояние переключателя
    faviconToggle.checked = isEnabled

    // Обновляем текст статуса
    if (toggleStatus) {
      toggleStatus.textContent = isEnabled
        ? i18n.t("SETTINGS.FAVICONS_ENABLED") || "Включено"
        : i18n.t("SETTINGS.FAVICONS_DISABLED") || "Выключено"
    }

    // Добавляем обработчик события
    faviconToggle.addEventListener("change", async () => {
      const enabled = faviconToggle.checked

      // Обновляем текст статуса
      if (toggleStatus) {
        toggleStatus.textContent = enabled
          ? i18n.t("SETTINGS.FAVICONS_ENABLED") || "Включено"
          : i18n.t("SETTINGS.FAVICONS_DISABLED") || "Выключено"
      }

      // Сохраняем состояние в хранилище
      console.log("Сохраняем состояние фавиконов:", enabled)
      await setFaviconsEnabled(enabled)

      if (enabled) {
        // Включаем индикатор загрузки
        loadingIndicator.classList.add("active")

        // Запускаем процесс обновления фавиконов
        updateAllFavicons((processed, total) => {
          // Обновляем прогресс
          const percentComplete = Math.round((processed / total) * 100)
          const loadingText = document.querySelector(
            "[data-translate='SETTINGS.FAVICONS_LOADING']"
          )
          loadingText.textContent = `Установка фавиконов... ${percentComplete}% (${processed}/${total})`
        }).then((result) => {
          loadingIndicator.classList.remove("active")
          if (result.success) {
            alert(`Успешно обновлено ${result.updated} фавиконов!`)
            // Повторно сохраняем состояние для уверенности
            setFaviconsEnabled(true)
          } else {
            alert(`Ошибка при обновлении фавиконов: ${result.error}`)
          }
        })
      } else {
        // При отключении очищаем все фавиконы
        loadingIndicator.classList.add("active")

        clearAllFavicons().then((result) => {
          loadingIndicator.classList.remove("active")
          if (result.success) {
            alert("Все фавиконы удалены!")
            // Повторно сохраняем состояние для уверенности
            setFaviconsEnabled(false)
          } else {
            alert(`Ошибка при удалении фавиконов: ${result.error}`)
          }
        })
      }
    })
  } catch (error) {
    console.error("Ошибка при инициализации переключателя фавиконов:", error)
  }
}
