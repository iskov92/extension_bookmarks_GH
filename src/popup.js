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
import {
  ICONS,
  UI_TEXTS,
  CONTEXT_MENU_CONFIG,
  ADD_BUTTONS_CONFIG,
  STORAGE_KEYS,
  DOM_IDS,
  CSS_CLASSES,
} from "./config/constants.js"

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
  const folderTitle = bookmarkElement.querySelector(
    `.${CSS_CLASSES.BOOKMARK_TITLE}`
  ).textContent
  navigation.push({ id, title: folderTitle })

  if (currentNestedMenu) {
    currentNestedMenu.destroy()
  }

  const nestedBookmarks = await ErrorHandler.wrapAsync(
    getBookmarksInFolder(id),
    ErrorType.NAVIGATION,
    "folder"
  )

  if (nestedBookmarks) {
    currentNestedMenu = new NestedMenu(mainContent, nestedBookmarks)
    currentNestedMenu.render()

    const currentFolder = document.getElementById(DOM_IDS.CURRENT_FOLDER)
    const backButton = document.getElementById(DOM_IDS.BACK_BUTTON)
    currentFolder.style.display = "block"
    currentFolder.textContent = folderTitle
    backButton.style.display = "block"
  } else {
    navigation.pop()
  }
}

async function handleBackButtonClick() {
  if (currentNestedMenu) {
    currentNestedMenu.destroy()
  }

  navigation.pop()
  const currentFolder = document.getElementById(DOM_IDS.CURRENT_FOLDER)
  const backButton = document.getElementById(DOM_IDS.BACK_BUTTON)

  if (navigation.isRoot) {
    currentNestedMenu = null
    const bookmarks = await getAllBookmarks()
    mainInterface.render()
    mainContent.classList.remove(CSS_CLASSES.NESTED_VIEW)
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
  const bookmarkElement = e.target.closest(`.${CSS_CLASSES.BOOKMARK_ITEM}`)
  if (!bookmarkElement) {
    contextMenu.close()
    return
  }

  const isFolder = bookmarkElement.classList.contains(CSS_CLASSES.FOLDER)
  const id = bookmarkElement.dataset.id
  const title = bookmarkElement.querySelector(
    `.${CSS_CLASSES.BOOKMARK_TITLE}`
  ).textContent
  const url = bookmarkElement.dataset.url

  const items = isFolder
    ? CONTEXT_MENU_CONFIG.FOLDER
    : CONTEXT_MENU_CONFIG.BOOKMARK

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
            UI_TEXTS.MODALS.EDIT_BOOKMARK,
            "link",
            { title, url },
            async (data) => {
              const result = await ErrorHandler.wrapAsync(
                updateBookmark(id, data),
                ErrorType.UPDATE,
                "bookmark"
              )
              if (result) {
                modal.close()
                await refreshCurrentView()
              }
            }
          )
        }
        break

      case "delete":
        if (confirm("Вы уверены, что хотите удалить эту закладку?")) {
          const deleted = await deleteBookmark(id)
          if (deleted) {
            await refreshCurrentView()
          } else {
            alert("Не удалось удалить закладку")
          }
        }
        break

      case "copy":
        contextMenu.close()
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
  document.body.classList.toggle(CSS_CLASSES.DARK_THEME, isDark)
  await chrome.storage.sync.set({
    [STORAGE_KEYS.THEME]: isDark ? "dark" : "light",
  })

  if (navigation.isRoot) {
    await mainInterface.render()
  } else if (currentNestedMenu) {
    await currentNestedMenu.render()
  }
}

async function refreshCurrentView() {
  try {
    // Очищаем контейнер перед обновлением
    while (mainContent.firstChild) {
      mainContent.removeChild(mainContent.firstChild)
    }

    if (navigation.isRoot) {
      const bookmarks = await ErrorHandler.wrapAsync(
        getAllBookmarks(),
        ErrorType.LOAD,
        "bookmarks"
      )
      if (bookmarks) {
        mainInterface = new MainInterface(mainContent, bookmarks)
        await mainInterface.render()
      }
    } else {
      const currentFolder = navigation.currentFolder
      const bookmarks = await ErrorHandler.wrapAsync(
        getBookmarksInFolder(currentFolder.id),
        ErrorType.LOAD,
        "bookmarks"
      )
      if (bookmarks) {
        currentNestedMenu = new NestedMenu(mainContent, bookmarks)
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

  ADD_BUTTONS_CONFIG.forEach((button) => {
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
      button.type === "folder"
        ? showCreateFolderDialog(parentId)
        : showCreateBookmarkDialog(parentId)
    })
    addTypeContent.appendChild(buttonElement)
  })

  const modal = new Modal()
  modal.show(
    UI_TEXTS.MODALS.SELECT_TYPE,
    "select",
    {},
    null,
    () => modal.close(),
    addTypeContent
  )
}

function showCreateFolderDialog(parentId) {
  const modal = new Modal()
  modal.show(UI_TEXTS.MODALS.CREATE_FOLDER, "folder", {}, async (data) => {
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
  modal.show(UI_TEXTS.MODALS.ADD_BOOKMARK, "link", {}, async (data) => {
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
