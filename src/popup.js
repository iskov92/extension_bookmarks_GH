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
  const mainContent = document.getElementById("mainContent")
  const backButton = document.getElementById("backButton")
  const addButton = document.getElementById("addButton")
  const settingsButton = document.getElementById("settingsButton")
  const currentFolder = document.getElementById("currentFolder")

  if (!mainContent) {
    throw new Error("Элемент mainContent не найден")
  }

  // Создаем экземпляры меню и модального окна
  const contextMenu = new ContextMenu()
  const modal = new Modal()

  // История навигации
  const navigationStack = []

  try {
    // Загрузка корневых закладок
    const bookmarks = await getAllBookmarks()
    const mainInterface = new MainInterface(mainContent, bookmarks)
    mainInterface.render()

    // Обработчик правого клика
    mainContent.addEventListener("contextmenu", async (e) => {
      e.preventDefault()
      const bookmarkElement = e.target.closest(".bookmark-item")
      if (!bookmarkElement) return

      const isFolder = bookmarkElement.classList.contains("folder")
      const id = bookmarkElement.dataset.id
      const title = bookmarkElement.querySelector(".bookmark-title").textContent
      const url = bookmarkElement.dataset.url

      const items = isFolder
        ? [
            {
              text: "Переименовать",
              icon: "assets/icons/edit.svg",
              action: "rename",
            },
            {
              text: "Удалить",
              icon: "assets/icons/delete.svg",
              action: "delete",
            },
            {
              text: "Копировать",
              icon: "assets/icons/move.svg",
              action: "copy",
            },
          ]
        : [
            {
              text: "Изменить",
              icon: "assets/icons/edit.svg",
              action: "edit",
            },
            {
              text: "Удалить",
              icon: "assets/icons/delete.svg",
              action: "delete",
            },
          ]

      contextMenu.show(
        e.pageX,
        e.pageY,
        items,
        bookmarkElement,
        async (action) => {
          try {
            switch (action) {
              case "rename":
              case "edit":
                modal.show(
                  isFolder ? "Переименовать папку" : "Изменить закладку",
                  isFolder ? "folder" : "link",
                  { title, url },
                  async (data) => {
                    try {
                      await updateBookmark(id, data)
                      // Перерисовываем текущий вид
                      if (navigationStack.length === 0) {
                        const bookmarks = await getAllBookmarks()
                        mainInterface.render()
                      } else {
                        const current =
                          navigationStack[navigationStack.length - 1]
                        const bookmarks = await getBookmarksInFolder(current.id)
                        const nestedMenu = new NestedMenu(
                          mainContent,
                          bookmarks
                        )
                        nestedMenu.render()
                      }
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
                    // Перерисовываем текущий вид
                    if (navigationStack.length === 0) {
                      const bookmarks = await getAllBookmarks()
                      mainInterface.render()
                    } else {
                      const current =
                        navigationStack[navigationStack.length - 1]
                      const bookmarks = await getBookmarksInFolder(current.id)
                      const nestedMenu = new NestedMenu(mainContent, bookmarks)
                      nestedMenu.render()
                    }
                  } catch (error) {
                    console.error("Ошибка при удалении:", error)
                    alert("Не удалось удалить элемент")
                  }
                }
                break

              case "copy":
                try {
                  const copy = await copyBookmark(id)
                  if (copy) {
                    // Перерисовываем текущий вид
                    if (navigationStack.length === 0) {
                      const bookmarks = await getAllBookmarks()
                      mainInterface.render()
                    } else {
                      const current =
                        navigationStack[navigationStack.length - 1]
                      const bookmarks = await getBookmarksInFolder(current.id)
                      const nestedMenu = new NestedMenu(mainContent, bookmarks)
                      nestedMenu.render()
                    }
                  }
                } catch (error) {
                  console.error("Ошибка при копировании:", error)
                  alert("Не удалось скопировать элемент")
                }
                break
            }
          } catch (error) {
            console.error("Ошибка в обработчике контекстного меню:", error)
            alert("Произошла ошибка при выполнении действия")
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

        // Показываем только заголовок
        currentFolder.style.display = "block"
        // Обновляем заголовок в шапке
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
        // Скрываем только заголовок
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
          : "0" // Корневая папка

      showAddDialog(parentId)
    })

    // Кнопка настроек
    settingsButton.addEventListener("click", () => {
      window.location.href = "settings.html"
    })
  } catch (error) {
    console.error("Ошибка при инициализации интерфейса:", error)
    mainContent.innerHTML = `<div class="error-message">Произошла ошибка при загрузке закладок</div>`
  }
}

function showAddDialog(parentId) {
  // TODO: Реализовать диалог добавления закладки/папки
}

function showSettings() {
  // TODO: Реализовать окно настроек
}
