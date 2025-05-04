import { initTheme } from "./utils/theme.js"
import { importFromBrowser, exportBookmarksToHTML } from "./utils/bookmarks.js"
import {
  getStoredBookmarks,
  saveBookmarks,
  getFaviconsEnabled,
  setFaviconsEnabled,
  updateAllFavicons,
  clearAllFavicons,
  storage,
} from "./utils/storage.js"
import { i18n } from "./utils/i18n.js"
import { iconStorage } from "./services/IconStorage.js"
import { trashStorage } from "./services/TrashStorage.js"

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

  // Инициализация функций управления хранилищем
  initStorageManagement()
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
        // Получаем содержимое заметки СО ВСЕМ форматированием HTML
        const content = noteElement.innerHTML.trim()

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

    // Обновляем текст статуса и класс
    if (toggleStatus) {
      toggleStatus.textContent = isEnabled
        ? i18n.t("SETTINGS.FAVICONS_ENABLED") || "Включено"
        : i18n.t("SETTINGS.FAVICONS_DISABLED") || "Выключено"

      // Добавляем класс для стилизации
      if (isEnabled) {
        toggleStatus.classList.add("active-status")
      } else {
        toggleStatus.classList.remove("active-status")
      }
    }

    // Добавляем обработчик события
    faviconToggle.addEventListener("change", async () => {
      const enabled = faviconToggle.checked

      // Обновляем текст статуса и класс
      if (toggleStatus) {
        toggleStatus.textContent = enabled
          ? i18n.t("SETTINGS.FAVICONS_ENABLED") || "Включено"
          : i18n.t("SETTINGS.FAVICONS_DISABLED") || "Выключено"

        // Обновляем класс для стилизации
        if (enabled) {
          toggleStatus.classList.add("active-status")
        } else {
          toggleStatus.classList.remove("active-status")
        }
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

// Функция инициализации управления хранилищем
async function initStorageManagement() {
  const storageInfoButton = document.getElementById("storageInfoButton")
  const storageClearButton = document.getElementById("storageClearButton")
  const storageInfoContainer = document.getElementById("storageInfo")

  // Обработчик кнопки "Информация"
  storageInfoButton.addEventListener("click", async () => {
    const isActive = storageInfoContainer.classList.contains("active")

    if (isActive) {
      // Если контейнер уже активен, скрываем его
      storageInfoContainer.classList.remove("active")
      storageInfoContainer.innerHTML = ""
    } else {
      // Если контейнер не активен, показываем информацию
      try {
        storageInfoContainer.innerHTML = '<div class="spinner"></div>'
        storageInfoContainer.classList.add("active")

        const storageInfo = await getStorageInfo()
        renderStorageInfo(storageInfo, storageInfoContainer)
      } catch (error) {
        console.error("Ошибка при получении информации о хранилище:", error)
        storageInfoContainer.innerHTML = `<div class="storage-error">Ошибка при получении информации о хранилище</div>`
      }
    }
  })

  // Обработчик кнопки "Очистить"
  storageClearButton.addEventListener("click", async () => {
    const confirmMessage = i18n.t("SETTINGS.STORAGE_CLEAR_CONFIRM")
    if (confirm(confirmMessage)) {
      try {
        await clearAllStorage()
        alert(i18n.t("SETTINGS.STORAGE_CLEARED"))

        // Обновляем информацию, если она отображается
        if (storageInfoContainer.classList.contains("active")) {
          const storageInfo = await getStorageInfo()
          renderStorageInfo(storageInfo, storageInfoContainer)
        }
      } catch (error) {
        console.error("Ошибка при очистке хранилища:", error)
        alert("Произошла ошибка при очистке хранилища")
      }
    }
  })
}

// Функция для получения информации о хранилище
async function getStorageInfo() {
  // Получаем информацию о закладках
  const bookmarks = await getStoredBookmarks()
  let bookmarksCount = 0

  // Рекурсивно считаем количество элементов
  function countItems(items) {
    for (const item of items) {
      bookmarksCount++
      if (item.children && item.children.length > 0) {
        countItems(item.children)
      }
    }
  }
  countItems(bookmarks)

  // Получаем информацию о размере данных Chrome Storage
  const storageData = await getStorageSize()
  const storageDataSize = storageData.usedSize
  const storagePercentage = storageData.percentage || 0

  // Получаем информацию о размере данных IndexedDB
  const indexedDBData = await getIndexedDBSize()
  const indexedDBSize = indexedDBData.size
  const indexedDBPercentage = indexedDBData.percentage || 0

  // Получаем информацию о количестве иконок папок
  let folderIconsCount = 0
  try {
    await iconStorage.init()
    const transaction = iconStorage.db.transaction(
      [iconStorage.ICONS_STORE],
      "readonly"
    )
    const store = transaction.objectStore(iconStorage.ICONS_STORE)
    const count = await new Promise((resolve) => {
      const countRequest = store.count()
      countRequest.onsuccess = () => resolve(countRequest.result)
      countRequest.onerror = () => resolve(0)
    })
    folderIconsCount = count
  } catch (error) {
    console.error("Ошибка при получении информации об иконках:", error)
  }

  // Получаем информацию о элементах в корзине
  let trashItemsCount = 0
  try {
    const trashItems = await trashStorage.getTrashItems()
    trashItemsCount = trashItems.length
  } catch (error) {
    console.error("Ошибка при получении информации о корзине:", error)
  }

  return {
    bookmarksCount,
    storageSize: formatBytes(storageDataSize),
    storagePercentage,
    indexedDBSize,
    indexedDBPercentage,
    folderIconsCount,
    trashItemsCount,
  }
}

// Функция для рендеринга информации о хранилище
function renderStorageInfo(info, container) {
  container.innerHTML = `
    <div class="storage-info-line">
      ${i18n.t("SETTINGS.STORAGE_BOOKMARKS", { count: info.bookmarksCount })}
    </div>
    <div class="storage-info-line">
      ${i18n.t("SETTINGS.STORAGE_ICONS", { count: info.folderIconsCount })}
    </div>
    <div class="storage-info-line">
      ${i18n.t("SETTINGS.STORAGE_TRASH", { count: info.trashItemsCount })}
    </div>
    <div class="storage-info-line">
      ${i18n.t("SETTINGS.STORAGE_SIZE_USED", {
        size: info.storageSize,
        percent: info.storagePercentage,
      })}
    </div>
    <div class="storage-info-line">
      ${i18n.t("SETTINGS.STORAGE_INDEXEDDB_SIZE", {
        size: info.indexedDBSize,
        percent: info.indexedDBPercentage,
      })}
    </div>
  `
}

// Функция для очистки хранилища
async function clearAllStorage() {
  // Очищаем Chrome Storage
  await new Promise((resolve, reject) => {
    chrome.storage.local.clear(() => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError)
      } else {
        resolve()
      }
    })
  })

  // Очищаем IndexedDB для иконок папок
  try {
    await iconStorage.init()
    const transaction = iconStorage.db.transaction(
      [iconStorage.ICONS_STORE],
      "readwrite"
    )
    const store = transaction.objectStore(iconStorage.ICONS_STORE)
    await new Promise((resolve, reject) => {
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error("Failed to clear icon storage"))
    })
  } catch (error) {
    console.error("Ошибка при очистке хранилища иконок:", error)
  }

  // Очищаем корзину
  try {
    await trashStorage.clearTrash()
  } catch (error) {
    console.error("Ошибка при очистке корзины:", error)
  }

  // Инициализируем хранилище с начальными значениями
  await storage.initializeStorage()

  // Устанавливаем тему и язык по умолчанию
  chrome.storage.local.set({ isDarkTheme: true })
  await i18n.setLocale("ru")
  updateLanguageToggle()
  translatePage()
  document.body.setAttribute("data-theme", "dark")
  const themeToggle = document.getElementById("themeToggle")
  if (themeToggle) {
    themeToggle.checked = true
  }

  // Сбрасываем состояние переключателя фавиконов
  const faviconToggle = document.getElementById("faviconToggle")
  if (faviconToggle) {
    faviconToggle.checked = false
  }
  const toggleStatus = document.querySelector(".toggle-status")
  if (toggleStatus) {
    toggleStatus.textContent = i18n.t("SETTINGS.FAVICONS_DISABLED")
    toggleStatus.classList.remove("active-status")
  }
}

// Вспомогательная функция для получения размера хранилища Chrome
async function getStorageSize() {
  try {
    const allData = await new Promise((resolve) => {
      chrome.storage.local.get(null, (items) => {
        resolve(items)
      })
    })

    // Преобразуем объект в строку JSON и измеряем её размер
    const jsonString = JSON.stringify(allData)
    const usedSize = jsonString.length

    // Стандартный лимит для chrome.storage.local составляет 5MB (5242880 байт)
    const storageLimit = 5242880

    // Вычисляем процент использования
    const percentage = Math.round((usedSize / storageLimit) * 100)

    return { usedSize, percentage: percentage + "%" }
  } catch (error) {
    console.error("Ошибка при получении размера хранилища:", error)
    return { usedSize: 0, percentage: "0%" }
  }
}

// Функция для получения размера IndexedDB
async function getIndexedDBSize() {
  try {
    // Сначала попытаемся получить размер через оценку данных
    let totalSize = 0
    let estimatedPercent = "?"

    // Получаем размер иконок папок
    try {
      await iconStorage.init()
      const iconsSize = await estimateIconsSize()
      totalSize += iconsSize
    } catch (error) {
      console.error("Ошибка при оценке размера иконок:", error)
    }

    // Получаем размер корзины
    try {
      const trashSize = await estimateTrashSize()
      totalSize += trashSize
    } catch (error) {
      console.error("Ошибка при оценке размера корзины:", error)
    }

    // Лимит для IndexedDB обычно ограничен только общим дисковым пространством,
    // но многие браузеры устанавливают мягкие ограничения от 50MB до безлимита.
    // Примем 50MB как консервативную оценку для расчета процентов
    if (totalSize > 0) {
      const estimatedLimit = 50 * 1024 * 1024 // 50MB в байтах
      estimatedPercent = Math.round((totalSize / estimatedLimit) * 100) + "%"
    }

    return {
      size: formatBytes(totalSize),
      percentage: estimatedPercent,
    }
  } catch (error) {
    console.error("Ошибка при оценке размера IndexedDB:", error)
    return {
      size: "0 Bytes",
      percentage: "0%",
    }
  }
}

// Функция для оценки размера иконок в IndexedDB
async function estimateIconsSize() {
  return new Promise(async (resolve) => {
    try {
      const transaction = iconStorage.db.transaction(
        [iconStorage.ICONS_STORE],
        "readonly"
      )
      const store = transaction.objectStore(iconStorage.ICONS_STORE)
      const request = store.getAll()

      request.onsuccess = (event) => {
        const icons = event.target.result
        let totalSize = 0

        icons.forEach((icon) => {
          if (icon.icon) {
            // Если это Blob, используем его размер
            if (icon.icon instanceof Blob) {
              totalSize += icon.icon.size
            }
            // Если это строка base64, оцениваем размер
            else if (
              typeof icon.icon === "string" &&
              icon.icon.includes("base64")
            ) {
              // Оценка размера base64 строки
              const base64 = icon.icon.split(",")[1]
              totalSize += Math.ceil(base64.length * 0.75) // Прибл. размер в байтах
            }
          }
        })

        resolve(totalSize)
      }

      request.onerror = () => {
        resolve(0)
      }
    } catch (error) {
      console.error("Ошибка при оценке размера иконок:", error)
      resolve(0)
    }
  })
}

// Функция для оценки размера корзины в IndexedDB
async function estimateTrashSize() {
  return new Promise(async (resolve) => {
    try {
      const trashItems = await trashStorage.getTrashItems()
      if (!trashItems || trashItems.length === 0) {
        resolve(0)
        return
      }

      // Преобразуем в JSON строку и оцениваем размер
      const jsonString = JSON.stringify(trashItems)
      resolve(jsonString.length)
    } catch (error) {
      console.error("Ошибка при оценке размера корзины:", error)
      resolve(0)
    }
  })
}

// Вспомогательная функция для форматирования размера в байтах
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes"

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ["Bytes", "KB", "MB", "GB"]

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i]
}
