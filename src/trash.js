import { initTheme } from "./utils/theme.js"
import { i18n } from "./utils/i18n.js"
import { trashStorage } from "./services/TrashStorage.js"
import { createBookmark, createFolder } from "./utils/bookmarks.js"
import { ErrorHandler, ErrorType } from "./utils/errorHandler.js"

let mainContent

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await trashStorage.init()
    initTheme()
    await i18n.initLocale()
    await initializeUI()
    translatePage()

    i18n.addListener(() => {
      translatePage()
      renderTrashItems()
    })
  } catch (error) {
    console.error("Ошибка инициализации:", error)
  }
})

function translatePage() {
  const elements = document.querySelectorAll("[data-translate]")
  elements.forEach((element) => {
    const key = element.dataset.translate
    element.textContent = i18n.t(key)
  })
}

async function initializeUI() {
  mainContent = document.getElementById("mainContent")
  const backButton = document.getElementById("backButton")
  const clearTrashButton = document.getElementById("clearTrashButton")
  const themeToggle = document.getElementById("themeToggle")

  // Set initial theme
  chrome.storage.sync.get(["theme"], (result) => {
    const currentTheme = result.theme || "light"
    document.body.setAttribute("data-theme", currentTheme)
    themeToggle.checked = currentTheme === "dark"
  })

  // Обработчики событий
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

  clearTrashButton.addEventListener("click", async () => {
    if (confirm(i18n.t("TRASH.CONFIRM_CLEAR"))) {
      await trashStorage.clearTrash()
      await renderTrashItems()
    }
  })

  themeToggle.addEventListener("change", handleThemeToggle)

  // Показываем кнопку "Назад"
  backButton.style.display = "block"

  // Отрисовываем элементы корзины
  await renderTrashItems()
}

async function handleThemeToggle(e) {
  const isDark = e.target.checked
  document.body.setAttribute("data-theme", isDark ? "dark" : "light")
  await chrome.storage.sync.set({ theme: isDark ? "dark" : "light" })
  await renderTrashItems()
}

async function renderTrashItems() {
  try {
    mainContent.innerHTML = ""
    const items = await trashStorage.getTrashItems()

    if (!items || items.length === 0) {
      const empty = document.createElement("div")
      empty.className = "empty-message"
      empty.textContent = i18n.t("TRASH.EMPTY")
      mainContent.appendChild(empty)
      return
    }

    const currentTheme = document.body.getAttribute("data-theme") || "light"
    const folderIcon =
      currentTheme === "dark"
        ? "../assets/icons/folder_white.svg"
        : "../assets/icons/folder_black.svg"

    for (const item of items) {
      const itemElement = document.createElement("div")
      itemElement.className = `bookmark-item ${
        item.type === "folder" ? "folder" : ""
      }`
      itemElement.dataset.id = item.id
      itemElement.dataset.type = item.type

      if (item.url) {
        itemElement.dataset.url = item.url
      }

      const icon = document.createElement("img")
      icon.className = "bookmark-icon"
      icon.src =
        item.type === "folder" ? folderIcon : "../assets/icons/link.svg"
      icon.alt = item.type

      const title = document.createElement("span")
      title.className = "bookmark-title"
      title.textContent = item.title

      const restoreButton = document.createElement("button")
      restoreButton.className = "restore-button"
      restoreButton.title = i18n.t("TRASH.RESTORE")
      restoreButton.innerHTML = `
        <img src="../assets/icons/return_white.svg" class="restore-icon light-theme-icon" alt="${i18n.t(
          "TRASH.RESTORE"
        )}">
        <img src="../assets/icons/return_black.svg" class="restore-icon dark-theme-icon" alt="${i18n.t(
          "TRASH.RESTORE"
        )}">
      `
      restoreButton.addEventListener("click", async (e) => {
        e.stopPropagation()
        await handleRestore(item)
      })

      itemElement.appendChild(icon)
      itemElement.appendChild(title)
      itemElement.appendChild(restoreButton)
      mainContent.appendChild(itemElement)
    }
  } catch (error) {
    console.error("Error rendering trash items:", error)
    ErrorHandler.handle(error, ErrorType.LOAD, "trash")
  }
}

async function handleRestore(item) {
  try {
    // Восстанавливаем элемент из корзины
    const restoredItem = await trashStorage.restoreItem(item.id)

    // Создаем элемент в корневой папке закладок
    if (item.type === "folder") {
      await ErrorHandler.wrapAsync(
        createFolder("0", item.title),
        ErrorType.RESTORE,
        "folder"
      )
    } else {
      await ErrorHandler.wrapAsync(
        createBookmark("0", item.title, item.url),
        ErrorType.RESTORE,
        "bookmark"
      )
    }

    // Обновляем отображение
    await renderTrashItems()
  } catch (error) {
    console.error("Error restoring item:", error)
    ErrorHandler.handle(error, ErrorType.RESTORE, item.type)
  }
}
