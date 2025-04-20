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
import { Navigation } from "./utils/navigation.js"
import { ErrorHandler, ErrorType } from "./utils/errorHandler.js"

// Глобальные переменные для доступа из всех функций
let mainInterface
let mainContent
let currentNestedMenu = null
const navigation = new Navigation()
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

// Обработчики событий
async function handleFolderClick(bookmarkElement) {
  const id = bookmarkElement.dataset.id
  const folderTitle =
    bookmarkElement.querySelector(".bookmark-title").textContent
  navigation.push({ id, title: folderTitle })

  // Уничтожаем предыдущее меню если оно есть
  if (currentNestedMenu) {
    currentNestedMenu.destroy()
  }

  const nestedBookmarks = await ErrorHandler.wrapAsync(
    getBookmarksInFolder(id),
    ErrorType.NAVIGATION,
    "folder"
  )

  if (nestedBookmarks) {
    // Создаем и сохраняем новое меню
    currentNestedMenu = new NestedMenu(mainContent, nestedBookmarks)
    currentNestedMenu.render()

    const currentFolder = document.getElementById("currentFolder")
    const backButton = document.getElementById("backButton")
    currentFolder.style.display = "block"
    currentFolder.textContent = folderTitle
    backButton.style.display = "block"
  } else {
    navigation.pop() // Откатываем навигацию при ошибке
  }
}

async function handleBackButtonClick() {
  // Уничтожаем текущее меню
  if (currentNestedMenu) {
    currentNestedMenu.destroy()
  }

  navigation.pop()
  const currentFolder = document.getElementById("currentFolder")
  const backButton = document.getElementById("backButton")

  if (navigation.isRoot) {
    currentNestedMenu = null
    const bookmarks = await getAllBookmarks()
    mainInterface.render()
    mainContent.classList.remove("nested-view")
    currentFolder.style.display = "none"
    backButton.style.display = "none"
  } else {
    const current = navigation.currentFolder
    const bookmarks = await getBookmarksInFolder(current.id)
    currentNestedMenu = new NestedMenu(mainContent, bookmarks)
    currentNestedMenu.render()
    currentFolder.textContent = current.title
  }
}

async function handleContextMenu(e) {
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

  contextMenu.show(e.pageX, e.pageY, items, bookmarkElement, async (action) => {
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
          const result = await ErrorHandler.wrapAsync(
            deleteBookmark(id),
            ErrorType.DELETE,
            isFolder ? "folder" : "bookmark"
          )
          if (result) {
            await refreshCurrentView()
          }
        }
        break

      case "copy":
        const result = await ErrorHandler.wrapAsync(
          copyBookmark(id),
          ErrorType.COPY,
          isFolder ? "folder" : "bookmark"
        )
        if (result) {
          await refreshCurrentView()
        }
        break

      default:
        console.error("Неизвестное действие:", action)
    }
  })
}

async function handleThemeToggle(e) {
  const isDark = e.target.checked
  document.body.classList.toggle("dark-theme", isDark)
  await chrome.storage.sync.set({ theme: isDark ? "dark" : "light" })

  // Обновляем только текущий интерфейс без полной перезагрузки
  if (navigation.isRoot) {
    await mainInterface.render()
  } else if (currentNestedMenu) {
    await currentNestedMenu.render()
  }
}

async function refreshCurrentView() {
  try {
    if (navigation.isRoot) {
      const bookmarks = await ErrorHandler.wrapAsync(
        getAllBookmarks(),
        ErrorType.LOAD,
        "bookmarks"
      )
      if (bookmarks) {
        mainInterface.bookmarks = bookmarks
        await mainInterface.render()
      }
    } else {
      const currentFolder = navigation.currentFolder
      const bookmarks = await ErrorHandler.wrapAsync(
        getBookmarksInFolder(currentFolder.id),
        ErrorType.LOAD,
        "bookmarks"
      )
      if (bookmarks && currentNestedMenu) {
        currentNestedMenu.bookmarks = bookmarks
        await currentNestedMenu.render()
      }
    }
  } catch (error) {
    ErrorHandler.handle(error, ErrorType.LOAD, "interface")
  }
}

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

  // Обработчики событий
  mainContent.addEventListener("contextmenu", handleContextMenu)

  mainContent.addEventListener("click", async (e) => {
    const bookmarkElement = e.target.closest(".bookmark-item")
    if (!bookmarkElement) return

    const isFolder = bookmarkElement.classList.contains("folder")
    if (isFolder) {
      await handleFolderClick(bookmarkElement)
    } else if (bookmarkElement.dataset.url) {
      chrome.tabs.create({ url: bookmarkElement.dataset.url })
    }
  })

  backButton.addEventListener("click", handleBackButtonClick)
  addButton.addEventListener("click", () => {
    const parentId = navigation.isRoot ? "0" : navigation.currentFolder.id
    showAddDialog(parentId)
  })

  settingsButton.addEventListener("click", () => {
    window.location.href = "settings.html"
  })

  document
    .getElementById("themeToggle")
    .addEventListener("change", handleThemeToggle)
}

function showAddDialog(parentId) {
  const addTypeContent = document.createElement("div")
  addTypeContent.className = "add-type-selector"

  const buttons = [
    {
      type: "folder",
      text: "Создать папку",
      icons: {
        light: "/assets/icons/folder_white.svg",
        dark: "/assets/icons/folder_black.svg",
      },
      onClick: () => showCreateFolderDialog(parentId),
    },
    {
      type: "link",
      text: "Добавить закладку",
      icon: "/assets/icons/link.svg",
      onClick: () => showCreateBookmarkDialog(parentId),
    },
  ]

  buttons.forEach((button) => {
    const buttonElement = document.createElement("button")
    buttonElement.className = "add-type-button"
    buttonElement.dataset.type = button.type

    buttonElement.innerHTML =
      button.type === "folder"
        ? `
      <img src="${button.icons.light}" class="add-type-icon light-theme-icon" alt="${button.text}">
      <img src="${button.icons.dark}" class="add-type-icon dark-theme-icon" alt="${button.text}">
      ${button.text}
    `
        : `
      <img src="${button.icon}" class="add-type-icon" alt="${button.text}">
      ${button.text}
    `

    buttonElement.addEventListener("click", () => {
      modal.close()
      button.onClick()
    })
    addTypeContent.appendChild(buttonElement)
  })

  const modal = new Modal()
  modal.show(
    "Выберите тип",
    "select",
    {},
    null,
    () => modal.close(),
    addTypeContent
  )
}

function showCreateFolderDialog(parentId) {
  const modal = new Modal()
  modal.show("Создать папку", "folder", {}, async (data) => {
    const result = await ErrorHandler.wrapAsync(
      createFolder(parentId, data.title),
      ErrorType.CREATE,
      "folder"
    )
    if (result) {
      modal.close()
      await refreshCurrentView()
      return true
    }
    return false
  })
}

function showCreateBookmarkDialog(parentId) {
  const modal = new Modal()
  modal.show("Добавить закладку", "link", {}, async (data) => {
    const result = await ErrorHandler.wrapAsync(
      createBookmark(parentId, data.title, data.url),
      ErrorType.CREATE,
      "bookmark"
    )
    if (result) {
      modal.close()
      await refreshCurrentView()
      return true
    }
    return false
  })
}

async function showFolderEditDialog(folder) {
  const savedIcon = await storage.get(`folder_icon_${folder.id}`)
  const customContent = createFolderEditContent(folder, savedIcon)

  const modal = new Modal()
  modal.show(
    "Изменить папку",
    "folder",
    {},
    async (data) => await handleFolderEdit(folder, customContent, modal),
    () => modal.close(),
    customContent
  )

  setupFileInput(customContent)
}

function createFolderEditContent(folder, savedIcon) {
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
  return customContent
}

async function handleFolderEdit(folder, customContent, modal) {
  const newTitle = customContent.querySelector("#folderTitle").value.trim()
  if (!newTitle) {
    alert("Название папки не может быть пустым")
    return false
  }

  const previewContent = customContent.querySelector(".preview-content")
  const previewImg = previewContent.querySelector("img")
  const iconUrl = previewImg ? previewImg.src : null

  const updateResult = await ErrorHandler.wrapAsync(
    updateFolder(folder.id, { title: newTitle }),
    ErrorType.UPDATE,
    "folder"
  )

  if (updateResult) {
    if (iconUrl) {
      await storage.set(`folder_icon_${folder.id}`, iconUrl)
    }
    modal.close()
    await refreshCurrentView()
    return true
  }
  return false
}

function setupFileInput(customContent) {
  const fileInput = customContent.querySelector("#iconFile")
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0]
    if (!file) return

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

      previewImg.src = event.target.result
      previewImg.onerror = () => {
        console.error("Failed to load image")
        previewImg.src = "/assets/icons/folder_black.svg"
        alert("Не удалось загрузить изображение")
      }
    }
    reader.readAsDataURL(file)
  })
}
