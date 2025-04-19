import {
  getAllBookmarks,
  createBookmark,
  createFolder,
  getBookmarksInFolder,
  updateBookmark,
  deleteBookmark,
  copyBookmark,
  updateFolder,
} from "./utils/bookmarks.js"
import { initTheme } from "./utils/theme.js"
import { MainInterface } from "./components/MainInterface.js"
import { NestedMenu } from "./components/NestedMenu.js"
import { ContextMenu } from "./components/ContextMenu.js"
import { Modal } from "./components/Modal.js"
import { storage } from "./utils/storage.js"

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
            text: "Изменить",
            icon: "/assets/icons/edit_white.svg",
            iconDark: "/assets/icons/edit_black.svg",
            action: "rename",
          },
          {
            text: "Удалить",
            icon: "/assets/icons/delete_white.svg",
            iconDark: "/assets/icons/delete_black.svg",
            action: "delete",
          },
          {
            text: "Копировать",
            icon: "/assets/icons/move_white.svg",
            iconDark: "/assets/icons/move_black.svg",
            action: "copy",
          },
        ]
      : [
          {
            text: "Изменить",
            icon: "/assets/icons/edit_white.svg",
            iconDark: "/assets/icons/edit_black.svg",
            action: "edit",
          },
          {
            text: "Удалить",
            icon: "/assets/icons/delete_white.svg",
            iconDark: "/assets/icons/delete_black.svg",
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
            if (isFolder) {
              showFolderEditDialog({
                id: id,
                title: title,
              })
            } else {
              const modal = new Modal()
              modal.show(
                "Изменить закладку",
                "link",
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
            }
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
  const bookmarks = await getAllBookmarks()

  if (navigationStack.length === 0) {
    // Обновляем корневой интерфейс
    if (!mainInterface) {
      mainInterface = new MainInterface(mainContent, bookmarks)
    } else {
      mainInterface.bookmarks = bookmarks
    }
    mainInterface.render()
  } else {
    // Обновляем вложенное меню
    const current = navigationStack[navigationStack.length - 1]
    const folderBookmarks = await getBookmarksInFolder(current.id)
    const nestedMenu = new NestedMenu(mainContent, folderBookmarks)
    nestedMenu.render()
  }
}

function showAddDialog(parentId) {
  const addTypeContent = document.createElement("div")
  addTypeContent.className = "add-type-selector"

  const folderButton = document.createElement("button")
  folderButton.className = "add-type-button"
  folderButton.dataset.type = "folder"
  folderButton.innerHTML = `
    <img src="/assets/icons/folder_white.svg" class="add-type-icon" alt="Folder">
    <img src="/assets/icons/folder_black.svg" class="add-type-icon" alt="Folder">
    Создать папку
  `

  const linkButton = document.createElement("button")
  linkButton.className = "add-type-button"
  linkButton.dataset.type = "link"
  linkButton.innerHTML = `
    <img src="/assets/icons/link.svg" class="add-type-icon" alt="Link">
    Добавить закладку
  `

  addTypeContent.appendChild(folderButton)
  addTypeContent.appendChild(linkButton)

  const modal = new Modal()
  modal.show(
    "Выберите тип",
    "select",
    {},
    null,
    () => {
      modal.close()
    },
    addTypeContent
  )

  // Добавляем обработчики после создания модального окна
  folderButton.addEventListener("click", () => {
    modal.close()
    showCreateFolderDialog(parentId)
  })

  linkButton.addEventListener("click", () => {
    modal.close()
    showCreateBookmarkDialog(parentId)
  })
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

async function showFolderEditDialog(folder) {
  // Получаем сохраненную иконку
  const savedIcon = await storage.get(`folder_icon_${folder.id}`)

  const customContent = document.createElement("div")
  customContent.className = "edit-folder"
  customContent.innerHTML = `
    <div class="form-group">
      <label for="folderTitle">Название папки</label>
      <input type="text" id="folderTitle" value="${folder.title}" />
    </div>
    <div class="form-group">
      <label for="iconFile">Загрузить иконку</label>
      <input type="file" id="iconFile" accept="image/*" />
    </div>
    <div class="form-group">
      <label for="iconUrl">URL иконки</label>
      <input type="text" id="iconUrl" placeholder="https://example.com/icon.png" />
    </div>
    <div class="icon-preview">
      <div class="preview-content">
        ${
          savedIcon
            ? `<img src="${savedIcon}" alt="Icon preview" />`
            : "Preview"
        }
      </div>
    </div>
  `

  const modal = new Modal()
  modal.show(
    "Изменить папку",
    "folder",
    {},
    async (data) => {
      const newTitle = customContent.querySelector("#folderTitle").value.trim()
      if (!newTitle) {
        alert("Название папки не может быть пустым")
        return false
      }

      const previewContent = customContent.querySelector(".preview-content")
      const previewImg = previewContent.querySelector("img")
      const iconUrl = previewImg ? previewImg.src : null

      try {
        // Сначала обновляем название папки
        await updateFolder(folder.id, { title: newTitle })

        // Затем сохраняем иконку если она есть
        if (iconUrl) {
          await storage.set(`folder_icon_${folder.id}`, iconUrl)
        }

        await refreshCurrentView()
        modal.close()
        return true
      } catch (error) {
        console.error("Error updating folder:", error)
        alert("Ошибка при обновлении папки")
        return false
      }
    },
    () => {
      modal.close()
    },
    customContent
  )

  // Обработчик для загрузки файла
  const fileInput = customContent.querySelector("#iconFile")
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0]
    if (file) {
      // Проверяем, что это изображение
      if (!file.type.startsWith("image/")) {
        alert("Пожалуйста, выберите изображение")
        return
      }

      const reader = new FileReader()
      reader.onload = (event) => {
        const previewContent = customContent.querySelector(".preview-content")
        let previewImg = previewContent.querySelector("img")

        if (!previewImg) {
          previewImg = document.createElement("img")
          previewContent.textContent = ""
          previewContent.appendChild(previewImg)
        }

        // Устанавливаем data URL как источник изображения
        previewImg.src = event.target.result

        // Очищаем поле URL, так как загружен файл
        customContent.querySelector("#iconUrl").value = ""
      }
      reader.readAsDataURL(file)
    }
  })

  // Обработчик для URL
  const urlInput = customContent.querySelector("#iconUrl")
  urlInput.addEventListener("change", async (e) => {
    const url = e.target.value.trim()
    if (url) {
      try {
        // Проверяем, что URL действителен
        const response = await fetch(url)
        if (!response.ok) throw new Error("Invalid URL")

        const previewContent = customContent.querySelector(".preview-content")
        let previewImg = previewContent.querySelector("img")

        if (!previewImg) {
          previewImg = document.createElement("img")
          previewContent.textContent = ""
          previewContent.appendChild(previewImg)
        }

        previewImg.src = url

        // Очищаем поле файла, так как указан URL
        customContent.querySelector("#iconFile").value = ""
      } catch (error) {
        alert("Не удалось загрузить изображение по указанному URL")
        urlInput.value = ""
      }
    }
  })
}
