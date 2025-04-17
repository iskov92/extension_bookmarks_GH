import {
  getAllBookmarks,
  createBookmark,
  createFolder,
  exportBookmarksToHTML,
} from "./utils/bookmarks.js"
import { initTheme } from "./utils/theme.js"
import { MainInterface } from "./components/MainInterface.js"
import { NestedMenu } from "./components/NestedMenu.js"

// Инициализация темы
document.addEventListener("DOMContentLoaded", () => {
  initTheme()
  initializeUI()
})

async function initializeUI() {
  const mainContent = document.getElementById("mainContent")
  const backButton = document.getElementById("backButton")
  const addButton = document.getElementById("addButton")
  const settingsButton = document.getElementById("settingsButton")

  // История навигации
  const navigationStack = []

  // Загрузка корневых закладок
  const bookmarks = await getAllBookmarks()
  const mainInterface = new MainInterface(mainContent, bookmarks)
  mainInterface.render()

  // Обработчик клика по папке
  mainContent.addEventListener("click", async (e) => {
    const bookmarkElement = e.target.closest(".bookmark-item")
    if (!bookmarkElement) return

    const id = bookmarkElement.dataset.id
    const isFolder = !bookmarkElement.dataset.url

    if (isFolder) {
      const nestedBookmarks = await chrome.bookmarks.getChildren(id)
      navigationStack.push({ id, title: bookmarkElement.textContent })

      const nestedMenu = new NestedMenu(mainContent, nestedBookmarks)
      nestedMenu.render()

      backButton.style.display = "block"
    } else {
      chrome.tabs.create({ url: bookmarkElement.dataset.url })
    }
  })

  // Кнопка "Назад"
  backButton.addEventListener("click", async () => {
    navigationStack.pop()
    if (navigationStack.length === 0) {
      mainInterface.render()
      backButton.style.display = "none"
    } else {
      const current = navigationStack[navigationStack.length - 1]
      const bookmarks = await chrome.bookmarks.getChildren(current.id)
      const nestedMenu = new NestedMenu(mainContent, bookmarks)
      nestedMenu.render()
    }
  })

  // Кнопка добавления
  addButton.addEventListener("click", () => {
    const parentId =
      navigationStack.length > 0
        ? navigationStack[navigationStack.length - 1].id
        : "1"

    showAddDialog(parentId)
  })

  // Кнопка настроек
  settingsButton.addEventListener("click", showSettings)
}

function showAddDialog(parentId) {
  // TODO: Реализовать диалог добавления закладки/папки
}

function showSettings() {
  // TODO: Реализовать окно настроек
}
