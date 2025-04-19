import {
  getAllBookmarks,
  createBookmark,
  createFolder,
  getBookmarksInFolder,
  updateBookmark,
  deleteBookmark,
  copyBookmark,
} from "./utils/bookmarks.js"
import { initTheme } from "./utils/theme.js"
import { MainInterface } from "./components/MainInterface.js"
import { NestedMenu } from "./components/NestedMenu.js"
import { ContextMenu } from "./components/ContextMenu.js"
import { Modal } from "./components/Modal.js"

// Глобальные переменные для доступа из всех функций
let mainInterface
let mainContent
let navigationStack = []

// Создаем единый экземпляр контекстного меню
const contextMenu = new ContextMenu()

// Предотвращаем стандартное контекстное меню браузера
document.addEventListener("contextmenu", (e) => {
  e.preventDefault()
})

// Инициализация темы
document.addEventListener("DOMContentLoaded", async () => {
  try {
    initTheme()
    await initializeUI()
  } catch (error) {
    console.error("Ошибка инициализации:", error)
  }
})

async function initializeUI() {
  mainContent = document.getElementById("mainContent")
  const backButton = document.getElementById("backButton")
  const addButton = document.getElementById("addButton")
  const settingsButton = document.getElementById("settingsButton")
  const currentFolder = document.getElementById("currentFolder")

  if (!mainContent) {
    throw new Error("Элемент mainContent не найден")
  }

  // Загрузка корневых закладок
  const bookmarks = await getAllBookmarks()
  mainInterface = new MainInterface(mainContent, bookmarks)
  mainInterface.render()

  // Обработчик правого клика
  mainContent.addEventListener("contextmenu", async (e) => {
    e.preventDefault()
    const bookmarkElement = e.target.closest(".bookmark-item")
    if (!bookmarkElement) {
      contextMenu.close()
      return
    }

    const isFolder = bookmarkElement.classList.contains("folder")
    const id = bookmarkElement.dataset.id
    const title = bookmarkElement.querySelector(".bookmark-title").textContent
    const url = bookmarkElement.dataset.url

    const items = isFolder
      ? [
          {
            text: "Переименовать",
            icon: "/assets/icons/edit.svg",
            action: "rename",
          },
          {
            text: "Удалить",
            icon: "/assets/icons/delete.svg",
            action: "delete",
          },
          {
            text: "Копировать",
            icon: "/assets/icons/move.svg",
            action: "copy",
          },
        ]
      : [
          {
            text: "Изменить",
            icon: "/assets/icons/edit.svg",
            action: "edit",
          },
          {
            text: "Удалить",
            icon: "/assets/icons/delete.svg",
            action: "delete",
          },
        ]

    contextMenu.show(
      e.pageX,
      e.pageY,
      items,
      bookmarkElement,
      async (action) => {
        console.log("Выбрано действие:", action) // Отладочный вывод

        switch (action) {
          case "rename":
          case "edit":
            const modal = new Modal()
            modal.show(
              isFolder ? "Переименовать папку" : "Изменить закладку",
              isFolder ? "folder" : "link",
              { title, url },
              async (data) => {
                try {
                  await updateBookmark(id, data)
                  await refreshCurrentView()
                } catch (error) {
                  console.error("Ошибка при обновлении:", error)
                  alert("Не удалось сохранить изменения")
                }
              }
            )
            break

          case "delete":
            if (confirm("Вы уверены, что хотите удалить этот элемент?")) {
              try {
                await deleteBookmark(id)
                await refreshCurrentView()
              } catch (error) {
                console.error("Ошибка при удалении:", error)
                alert("Не удалось удалить элемент")
              }
            }
            break

          case "copy":
            try {
              await copyBookmark(id)
              await refreshCurrentView()
            } catch (error) {
              console.error("Ошибка при копировании:", error)
              alert("Не удалось скопировать элемент")
            }
            break

          default:
            console.error("Неизвестное действие:", action)
        }
      }
    )
  })

  // Обработчик клика по папке
  mainContent.addEventListener("click", async (e) => {
    const bookmarkElement = e.target.closest(".bookmark-item")
    if (!bookmarkElement) return

    const id = bookmarkElement.dataset.id
    const isFolder = bookmarkElement.classList.contains("folder")

    if (isFolder) {
      const nestedBookmarks = await getBookmarksInFolder(id)
      const folderTitle =
        bookmarkElement.querySelector(".bookmark-title").textContent
      navigationStack.push({ id, title: folderTitle })

      const nestedMenu = new NestedMenu(mainContent, nestedBookmarks)
      nestedMenu.render()

      currentFolder.style.display = "block"
      currentFolder.textContent = folderTitle
      backButton.style.display = "block"
    } else if (bookmarkElement.dataset.url) {
      chrome.tabs.create({ url: bookmarkElement.dataset.url })
    }
  })

  // Кнопка "Назад"
  backButton.addEventListener("click", async () => {
    navigationStack.pop()
    if (navigationStack.length === 0) {
      const bookmarks = await getAllBookmarks()
      mainInterface.render()
      mainContent.classList.remove("nested-view")
      currentFolder.style.display = "none"
      backButton.style.display = "none"
    } else {
      const current = navigationStack[navigationStack.length - 1]
      const bookmarks = await getBookmarksInFolder(current.id)
      const nestedMenu = new NestedMenu(mainContent, bookmarks)
      nestedMenu.render()
      currentFolder.textContent = current.title
    }
  })

  // Кнопка добавления
  addButton.addEventListener("click", () => {
    const parentId =
      navigationStack.length > 0
        ? navigationStack[navigationStack.length - 1].id
        : "0"

    showAddDialog(parentId)
  })

  // Кнопка настроек
  settingsButton.addEventListener("click", () => {
    window.location.href = "settings.html"
  })
}

// Функция для обновления текущего вида
async function refreshCurrentView() {
  if (navigationStack.length === 0) {
    const bookmarks = await getAllBookmarks()
    mainInterface.render()
  } else {
    const current = navigationStack[navigationStack.length - 1]
    const bookmarks = await getBookmarksInFolder(current.id)
    const nestedMenu = new NestedMenu(mainContent, bookmarks)
    nestedMenu.render()
  }
}

function showAddDialog(parentId) {
  const addModal = new Modal()
  const items = [
    {
      text: "Добавить папку",
      icon: "/assets/icons/folder.svg",
      action: "folder",
    },
    {
      text: "Добавить закладку",
      icon: "/assets/icons/link.svg",
      action: "link",
    },
  ]

  const content = document.createElement("div")
  content.className = "add-type-selector"

  items.forEach((item) => {
    const button = document.createElement("button")
    button.className = "add-type-button"

    const icon = document.createElement("img")
    icon.src = item.icon
    icon.alt = ""
    icon.className = "add-type-icon"

    const text = document.createElement("span")
    text.textContent = item.text

    button.appendChild(icon)
    button.appendChild(text)

    button.onclick = () => {
      addModal.close()
      if (item.action === "folder") {
        showCreateFolderDialog(parentId)
      } else {
        showCreateBookmarkDialog(parentId)
      }
    }

    content.appendChild(button)
  })

  addModal.show("Выберите тип", "select", {}, null, null, content)
}

function showCreateFolderDialog(parentId) {
  const modal = new Modal()
  modal.show("Создать папку", "folder", {}, async (data) => {
    try {
      await createFolder(parentId, data.title)
      await refreshCurrentView()
    } catch (error) {
      console.error("Ошибка при создании папки:", error)
      alert("Не удалось создать папку")
    }
  })
}

function showCreateBookmarkDialog(parentId) {
  const modal = new Modal()
  modal.show("Добавить закладку", "link", {}, async (data) => {
    try {
      await createBookmark(parentId, data.title, data.url)
      await refreshCurrentView()
    } catch (error) {
      console.error("Ошибка при создании закладки:", error)
      alert("Не удалось создать закладку")
    }
  })
}

function showSettings() {
  // TODO: Реализовать окно настроек
}
