import {
  getAllBookmarks,
  createBookmark,
  createFolder,
  getBookmarksInFolder,
  updateBookmark,
  deleteBookmark,
  copyBookmark,
  updateFolder,
  moveBookmark,
  reorderBookmarks,
} from "./utils/bookmarks.js"
import { initTheme } from "./utils/theme.js"
import { MainInterface } from "./components/MainInterface.js"
import { NestedMenu } from "./components/NestedMenu.js"
import { ContextMenu } from "./components/ContextMenu.js"
import { Modal } from "./components/Modal.js"
import { storage } from "./utils/storage.js"
import { Navigation } from "./utils/navigation.js"
import { ErrorHandler, ErrorType } from "./utils/errorHandler.js"
import { i18n } from "./utils/i18n.js"
import {
  ICONS,
  UI_TEXTS,
  CONTEXT_MENU_CONFIG,
  ADD_BUTTONS_CONFIG,
  STORAGE_KEYS,
  DOM_IDS,
  CSS_CLASSES,
} from "./config/constants.js"
import { iconStorage } from "./services/IconStorage.js"
import { trashStorage } from "./services/TrashStorage.js"

// Глобальные переменные для доступа из всех функций
let mainInterface
let mainContent
let currentNestedMenu = null
const navigation = new Navigation()
const contextMenu = new ContextMenu()
let draggedElement = null
let draggedElementId = null
let draggedElementType = null
let targetElement = null
let folderHoverTimer = null
let dropTarget = null
let dropIndicator = null
let draggingStarted = false
let currentParentId = "0" // ID текущей родительской папки
let lastHoveredFolder = null

// Предотвращаем стандартное контекстное меню браузера
document.addEventListener("contextmenu", (e) => {
  e.preventDefault()
})

// Инициализация темы
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await iconStorage.init()
    await iconStorage.migrateFromStorage()
    initTheme()

    // Обработка параметра path из URL
    const urlParams = new URLSearchParams(window.location.search)
    const pathParam = urlParams.get("path")
    if (pathParam) {
      try {
        const pathData = JSON.parse(decodeURIComponent(pathParam))
        if (Array.isArray(pathData) && pathData.length > 0) {
          navigation.setStack(pathData)
          // Обновляем UI для текущей папки
          const currentFolder = navigation.currentFolder
          if (currentFolder) {
            mainContent = document.getElementById("mainContent")
            const bookmarks = await getBookmarksInFolder(currentFolder.id)
            currentNestedMenu = new NestedMenu(mainContent, bookmarks)
            await currentNestedMenu.render()

            const currentFolderElement = document.getElementById(
              DOM_IDS.CURRENT_FOLDER
            )
            const backButton = document.getElementById(DOM_IDS.BACK_BUTTON)
            if (currentFolderElement && backButton) {
              currentFolderElement.style.display = "block"
              currentFolderElement.textContent = currentFolder.title
              backButton.style.display = "block"
            }
          }
        }
      } catch (e) {
        console.error("Failed to parse path parameter:", e)
      }
    }

    await i18n.initLocale()
    await initializeUI()
    translatePage()

    // Подписываемся на изменения языка
    i18n.addListener(() => {
      translatePage()
      refreshCurrentView()
    })
  } catch (error) {
    console.error("Ошибка инициализации:", error)
  }
})

// Функция перевода страницы
function translatePage() {
  const elements = document.querySelectorAll("[data-translate]")
  elements.forEach((element) => {
    const key = element.dataset.translate
    element.textContent = i18n.t(key)
  })
}

// Добавляем функцию для рекурсивного получения содержимого
async function getFolderContentsRecursively(folderId) {
  const contents = await getBookmarksInFolder(folderId)
  for (const item of contents) {
    if (item.type === "folder") {
      item.contents = await getFolderContentsRecursively(item.id)
    }
  }
  return contents
}

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
        if (confirm(i18n.t("CONFIRM_DELETE"))) {
          try {
            let itemToTrash = {
              id,
              type: isFolder ? "folder" : "bookmark",
              title,
              url,
            }

            // Если это папка, получаем её содержимое рекурсивно
            if (isFolder) {
              const folderContents = await getFolderContentsRecursively(id)
              itemToTrash.contents = folderContents
            }

            // Сохраняем в корзину перед удалением
            await trashStorage.moveToTrash(itemToTrash, navigation.getStack())

            // Удаляем из закладок
            const deleted = await deleteBookmark(id)
            if (deleted) {
              await refreshCurrentView()
            } else {
              alert(i18n.t("ERROR.DELETE_FAILED"))
            }
          } catch (error) {
            console.error("Error deleting item:", error)
            ErrorHandler.handle(
              error,
              ErrorType.DELETE,
              isFolder ? "folder" : "bookmark"
            )
          }
        }
        break

      case "copy":
        contextMenu.close()
        const currentFolderId = navigation.isRoot
          ? "0"
          : navigation.currentFolder.id
        const result = await ErrorHandler.wrapAsync(
          copyBookmark(id, currentFolderId),
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

/**
 * Обновляет текущее представление закладок
 */
async function refreshCurrentView() {
  const mainContent = document.querySelector(".main-content")
  const currentFolderTitle = document.querySelector(".current-folder")

  try {
    // Отображаем лоадер при необходимости
    showLoadingIndicator()

    // Уничтожаем существующий экземпляр Sortable, если он есть
    if (window.sortableInstance) {
      window.sortableInstance.destroy()
      window.sortableInstance = null
    }

    // Получаем текущий ID родительской папки
    const parentId = navigation.getCurrentParentId()
    const bookmarks = await getBookmarksInFolder(parentId)

    // Очищаем содержимое
    mainContent.innerHTML = ""

    // Сохраняем ID текущей папки в атрибуте data-folder-id
    mainContent.dataset.folderId = parentId

    // Обновляем заголовок текущей папки
    if (currentFolderTitle) {
      if (navigation.currentFolder) {
        currentFolderTitle.textContent = navigation.currentFolder.title
        currentFolderTitle.style.display = "block"
      } else {
        currentFolderTitle.textContent = ""
        currentFolderTitle.style.display = "none"
      }
    }

    // Если находимся в корне, изменяем классы для стилизации
    if (navigation.isRoot) {
      mainContent.classList.remove("nested-view")
      document.querySelector(".back-button").style.display = "none"
    } else {
      mainContent.classList.add("nested-view")
      document.querySelector(".back-button").style.display = "flex"
    }

    // Если папка пуста, показываем сообщение
    if (bookmarks.length === 0) {
      const emptyMessage = document.createElement("div")
      emptyMessage.className = "empty-message"
      emptyMessage.textContent = navigation.isRoot
        ? getTranslation("MESSAGES.NO_BOOKMARKS")
        : getTranslation("MESSAGES.EMPTY_FOLDER")

      mainContent.appendChild(emptyMessage)
    } else {
      // Создаем элементы закладок/папок
      bookmarks.forEach((bookmark) => {
        const bookmarkElement = createBookmarkElement(bookmark)
        mainContent.appendChild(bookmarkElement)
      })
    }

    // Инициализируем Sortable после добавления элементов
    initDragAndDrop()
  } catch (error) {
    console.error("Ошибка при обновлении представления:", error)
    showErrorMessage("Не удалось загрузить закладки")
  } finally {
    // Скрываем лоадер
    hideLoadingIndicator()
  }
}

/**
 * Показывает индикатор загрузки
 */
function showLoadingIndicator() {
  let loader = document.querySelector(".loader")

  if (!loader) {
    loader = document.createElement("div")
    loader.className = "loader"
    document.body.appendChild(loader)
  }

  loader.style.display = "block"
}

/**
 * Скрывает индикатор загрузки
 */
function hideLoadingIndicator() {
  const loader = document.querySelector(".loader")
  if (loader) {
    loader.style.display = "none"
  }
}

/**
 * Показывает сообщение об ошибке
 */
function showErrorMessage(message) {
  alert(message)
}

async function initializeUI() {
  mainContent = document.getElementById("mainContent")
  const backButton = document.getElementById("backButton")
  const addButton = document.getElementById("addButton")
  const settingsButton = document.getElementById("settingsButton")
  const trashButton = document.getElementById("trashButton")
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
    // Сохраняем текущий путь навигации
    const navigationState = {
      stack: navigation.getStack(),
    }
    chrome.storage.local.set({ navigationState }, () => {
      window.location.href = "settings.html"
    })
  })

  trashButton.addEventListener("click", () => {
    // Сохраняем текущий путь навигации
    const navigationState = {
      stack: navigation.getStack(),
    }
    chrome.storage.local.set({ navigationState }, () => {
      window.location.href = "trash.html"
    })
  })

  document
    .getElementById("themeToggle")
    .addEventListener("change", handleThemeToggle)

  // Инициализация обработчиков перетаскивания
  initDragAndDrop()
}

function showAddDialog(parentId) {
  const addTypeContent = document.createElement("div")
  addTypeContent.className = "add-type-selector"

  ADD_BUTTONS_CONFIG.forEach((button) => {
    const buttonElement = document.createElement("button")
    buttonElement.className = "add-type-button"
    buttonElement.dataset.type = button.type
    buttonElement.dataset.translate =
      button.type === "folder"
        ? "BUTTONS.CREATE_FOLDER"
        : "BUTTONS.ADD_BOOKMARK"

    buttonElement.innerHTML =
      button.type === "folder"
        ? `
      <img src="${
        button.icons.light
      }" class="add-type-icon light-theme-icon" alt="${i18n.t(
            "BUTTONS.CREATE_FOLDER"
          )}">
      <img src="${
        button.icons.dark
      }" class="add-type-icon dark-theme-icon" alt="${i18n.t(
            "BUTTONS.CREATE_FOLDER"
          )}">
      ${i18n.t("BUTTONS.CREATE_FOLDER")}
    `
        : `
      <img src="${button.icon}" class="add-type-icon" alt="${i18n.t(
            "BUTTONS.ADD_BOOKMARK"
          )}">
      ${i18n.t("BUTTONS.ADD_BOOKMARK")}
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
    i18n.t("MODALS.SELECT_TYPE"),
    "select",
    {},
    null,
    () => modal.close(),
    addTypeContent
  )
}

function showCreateFolderDialog(parentId) {
  const modal = new Modal()
  modal.show(i18n.t("MODALS.CREATE_FOLDER"), "folder", {}, async (data) => {
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
  modal.show(i18n.t("MODALS.ADD_BOOKMARK"), "link", {}, async (data) => {
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

// Функция для оптимизации изображения
async function optimizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")

    img.onload = () => {
      // Максимальные размеры
      const MAX_WIDTH = 128
      const MAX_HEIGHT = 128

      let width = img.width
      let height = img.height

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width
          width = MAX_WIDTH
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height
          height = MAX_HEIGHT
        }
      }

      canvas.width = width
      canvas.height = height

      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => resolve(blob),
        "image/png",
        0.8 // качество
      )
    }

    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = URL.createObjectURL(file)
  })
}

// Обновляем функцию сохранения иконки
async function handleIconUpload(file, folderId) {
  try {
    if (!file || !folderId) return null

    // Проверяем размер файла (4MB максимум)
    if (file.size > 4 * 1024 * 1024) {
      throw new Error("File size exceeds 4MB limit")
    }

    // Оптимизируем изображение
    const optimizedBlob = await optimizeImage(file)

    // Сохраняем в IndexedDB
    await iconStorage.saveIcon(folderId, optimizedBlob)

    // Возвращаем URL для отображения
    return URL.createObjectURL(optimizedBlob)
  } catch (error) {
    console.error("Error handling icon upload:", error)
    throw error
  }
}

function setupFileInput(customContent, folder) {
  const fileInput = customContent.querySelector("#iconFile")
  const previewContent = customContent.querySelector(".preview-content")
  const fileStatus = customContent.querySelector(".file-status")
  const fileSelectButton = customContent.querySelector(".file-select-button")
  let previewImg = previewContent.querySelector("img")

  // Добавляем обработчик клика по кнопке выбора файла
  fileSelectButton.addEventListener("click", () => {
    fileInput.click()
  })

  fileInput.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) {
      fileStatus.textContent = i18n.t("LABELS.FILE_NOT_SELECTED")
      fileStatus.dataset.translate = "LABELS.FILE_NOT_SELECTED"
      return
    }

    if (!file.type.startsWith("image/")) {
      alert(i18n.t("VALIDATIONS.INVALID_IMAGE"))
      fileInput.value = ""
      fileStatus.textContent = i18n.t("LABELS.FILE_NOT_SELECTED")
      fileStatus.dataset.translate = "LABELS.FILE_NOT_SELECTED"
      return
    }

    fileStatus.textContent = file.name
    fileStatus.removeAttribute("data-translate")

    try {
      const optimizedIcon = await handleIconUpload(file, folder.id)
      if (!previewImg) {
        previewImg = document.createElement("img")
        previewImg.alt = i18n.t("LABELS.PREVIEW")
      }
      previewImg.src = optimizedIcon
      previewContent.textContent = ""
      previewContent.appendChild(previewImg)
    } catch (error) {
      alert(error.message)
      fileInput.value = ""
      fileStatus.textContent = i18n.t("LABELS.FILE_NOT_SELECTED")
      fileStatus.dataset.translate = "LABELS.FILE_NOT_SELECTED"
      previewContent.textContent = i18n.t("LABELS.PREVIEW")
      previewImg = null
    }
  }
}

async function showFolderEditDialog(folder) {
  const savedIcon = await storage.get(`folder_icon_${folder.id}`)
  const customContent = createFolderEditContent(folder, savedIcon)

  const modal = new Modal()
  modal.show(
    i18n.t("MODALS.EDIT_FOLDER"),
    "folder",
    {},
    async (data) => await handleFolderEdit(folder, customContent, modal),
    () => modal.close(),
    customContent
  )

  setupFileInput(customContent, folder)
}

function createFolderEditContent(folder, savedIcon) {
  const customContent = document.createElement("div")
  customContent.className = "edit-folder"
  customContent.innerHTML = `
    <div class="form-group">
      <label for="folderTitle" data-translate="LABELS.FOLDER_NAME">${i18n.t(
        "LABELS.FOLDER_NAME"
      )}</label>
      <input type="text" id="folderTitle" value="${folder.title}" />
    </div>
    <div class="form-group">
      <label for="iconFile" data-translate="LABELS.UPLOAD_ICON">${i18n.t(
        "LABELS.UPLOAD_ICON"
      )}</label>
      <div class="file-input-wrapper">
        <input type="file" id="iconFile" accept="image/*" />
        <button class="file-select-button" data-translate="LABELS.CHOOSE_FILE">${i18n.t(
          "LABELS.CHOOSE_FILE"
        )}</button>
        <span class="file-status" data-translate="LABELS.FILE_NOT_SELECTED">${i18n.t(
          "LABELS.FILE_NOT_SELECTED"
        )}</span>
      </div>
    </div>
    <div class="form-group">
      <label data-translate="LABELS.PREVIEW">${i18n.t("LABELS.PREVIEW")}</label>
      <div class="preview-content">
        ${
          savedIcon && savedIcon.startsWith("data:image/")
            ? `<img src="${savedIcon}" alt="${i18n.t("LABELS.PREVIEW")}" />`
            : `<div class="preview-placeholder"></div>`
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

/**
 * Инициализирует функционал перетаскивания с использованием библиотеки Sortable.js
 */
function initDragAndDrop() {
  const container = document.getElementById("mainContent")
  if (!container) {
    console.error("Контейнер закладок не найден")
    return
  }

  // Если уже есть экземпляр Sortable, уничтожаем его
  if (window.sortableInstance) {
    window.sortableInstance.destroy()
    window.sortableInstance = null
  }

  // Инициализируем Sortable с базовыми настройками
  window.sortableInstance = new Sortable(container, {
    animation: 150,
    handle: ".bookmark-item",
    draggable: ".bookmark-item",
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    dragClass: "sortable-drag",
    fallbackClass: "sortable-fallback",
    forceFallback: false,
    scroll: true,
    scrollSensitivity: 80,
    scrollSpeed: 15,
    delay: 0,
    delayOnTouchOnly: true,
    touchStartThreshold: 3,
    supportPointer: true,
    preventOnFilter: false,

    // Обработчик начала перетаскивания
    onStart: function (evt) {
      console.log("Начало перетаскивания", evt.item)
      const draggedItem = evt.item

      // Сохраняем ID перетаскиваемого элемента
      window.draggedItemId = draggedItem.dataset.id
      window.draggedItemType = draggedItem.classList.contains("folder")
        ? "folder"
        : "bookmark"

      // Добавляем класс dragging к телу документа
      document.body.classList.add("dragging")
    },

    // Обработчик окончания перетаскивания
    onEnd: function (evt) {
      console.log("Окончание перетаскивания", evt)

      // Очищаем таймер и выделение папки
      if (folderHoverTimer) {
        clearTimeout(folderHoverTimer)
        folderHoverTimer = null
      }

      if (lastHoveredFolder) {
        lastHoveredFolder.classList.remove("highlight")
        lastHoveredFolder = null
      }

      // Обрабатываем перетаскивание если был изменён порядок
      if (evt.newIndex !== evt.oldIndex || evt.to !== evt.from) {
        handleSortableEnd(evt)
      }

      // Очищаем переменные
      window.draggedItemId = null
      window.draggedItemType = null

      // Удаляем класс dragging с тела документа
      document.body.classList.remove("dragging")
    },

    // Обработчик перемещения
    onMove: function (evt, originalEvent) {
      const targetItem = evt.related

      // Очищаем предыдущий таймер и выделение
      if (folderHoverTimer) {
        clearTimeout(folderHoverTimer)
        folderHoverTimer = null
      }

      if (lastHoveredFolder && lastHoveredFolder !== targetItem) {
        lastHoveredFolder.classList.remove("highlight")
        lastHoveredFolder = null
      }

      // Если целевой элемент является папкой
      if (targetItem && targetItem.classList.contains("folder")) {
        // Выделяем папку
        targetItem.classList.add("highlight")
        lastHoveredFolder = targetItem

        // Устанавливаем таймер для открытия папки
        folderHoverTimer = setTimeout(() => {
          // Получаем ID папки
          const folderId = targetItem.dataset.id

          // Очищаем переменные и устанавливаем выделение перед перемещением
          folderHoverTimer = null
          if (lastHoveredFolder) {
            lastHoveredFolder.classList.remove("highlight")
            lastHoveredFolder = null
          }

          // Перемещаем элемент в папку
          moveItemToFolder(window.draggedItemId, folderId)
            .then(() => {
              // Обновляем отображение содержимого папки
              refreshCurrentFolder()
            })
            .catch((error) => {
              console.error("Ошибка при перемещении в папку:", error)
              ErrorHandler.handle(
                error,
                ErrorType.MOVE,
                window.draggedItemType || "bookmark"
              )
            })
        }, 800) // Задержка перед открытием папки
      }

      return true // Разрешаем перемещение
    },
  })

  console.log("Sortable.js инициализирован успешно")
}

// Обработчик окончания сортировки
async function handleSortableEnd(evt) {
  try {
    // Получаем ID перетаскиваемого элемента и новую позицию
    const itemId = window.draggedItemId
    const newIndex = evt.newIndex

    if (!itemId) {
      console.error("ID перетаскиваемого элемента не найден")
      return
    }

    console.log(`Перемещаем элемент ${itemId} на позицию ${newIndex}`)

    // Получаем все видимые элементы
    const items = Array.from(document.querySelectorAll(".bookmark-item"))

    // Получаем текущую папку или ID родительской папки
    const currentFolderId = navigation.isRoot
      ? "0"
      : navigation.currentFolder?.id

    // Если новый индекс существует и не равен старому
    if (newIndex !== undefined) {
      // Определяем ID элемента, перед которым будет размещен перетаскиваемый элемент
      let targetId = null

      if (newIndex < items.length) {
        targetId = items[newIndex].dataset.id
      }

      // Если у нас есть и исходный элемент и целевой элемент
      if (itemId && targetId) {
        // Перед изменением порядка уничтожаем Sortable
        if (window.sortableInstance) {
          window.sortableInstance.destroy()
          window.sortableInstance = null
        }

        // Обновляем порядок закладок
        await reorderBookmarks(itemId, targetId, currentFolderId)

        // Обновляем текущую папку
        await refreshCurrentFolder()
      }
    }
  } catch (error) {
    console.error("Ошибка при обработке перетаскивания:", error)
    // Используем ErrorHandler.handle вместо ErrorHandler.show
    ErrorHandler.handle(error, ErrorType.REORDER, "general")
  }
}

// Функция обновления текущей папки (если её нет, добавим)
async function refreshCurrentFolder() {
  // Уничтожаем существующий экземпляр Sortable перед обновлением
  if (window.sortableInstance) {
    window.sortableInstance.destroy()
    window.sortableInstance = null
  }

  const currentFolderId = navigation.isRoot ? "0" : navigation.currentFolder?.id
  if (currentFolderId) {
    await refreshCurrentView()
  }
}

// Функция для перемещения элемента в папку
async function moveItemToFolder(itemId, folderId) {
  try {
    console.log(`Перемещаем элемент ${itemId} в папку ${folderId}`)

    // Уничтожаем существующий экземпляр Sortable перед операцией
    if (window.sortableInstance) {
      window.sortableInstance.destroy()
      window.sortableInstance = null
    }

    // Используем существующую функцию moveBookmark из bookmarks.js
    await moveBookmark(itemId, folderId)

    return true
  } catch (error) {
    console.error("Ошибка при перемещении элемента в папку:", error)
    throw error
  }
}

/**
 * Показывает или скрывает индикатор перетаскивания
 * @param {boolean} show - Показать или скрыть индикатор
 */
function showDragIndicator(show) {
  let indicator = document.querySelector(".drag-indicator")

  if (!indicator && show) {
    indicator = document.createElement("div")
    indicator.className = "drag-indicator"
    indicator.textContent = getTranslation("DRAG_DROP.MOVING")
    document.body.appendChild(indicator)
  }

  if (indicator) {
    indicator.style.display = show ? "block" : "none"
  }
}

/**
 * Обрабатывает изменение порядка элементов внутри одного контейнера
 * @param {HTMLElement} item - Перемещенный элемент
 * @param {number} oldIndex - Старая позиция
 * @param {number} newIndex - Новая позиция
 */
async function handleItemReordered(item, oldIndex, newIndex) {
  try {
    // Получаем ID перемещенного элемента
    const itemId = item.dataset.id

    // Получаем текущий родительский ID
    const parentId = navigation.getCurrentParentId()

    // Получаем все элементы в контейнере
    const itemsInContainer = Array.from(
      document.querySelectorAll(".main-content > .bookmark-item")
    )

    // Получаем ID элемента, относительно которого перемещаем (берем ID соседнего элемента)
    let targetIndex = newIndex
    if (targetIndex >= itemsInContainer.length) {
      targetIndex = itemsInContainer.length - 1
    }

    const targetId = itemsInContainer[targetIndex]?.dataset.id

    if (!targetId) {
      console.error(
        "Не удалось определить целевой элемент для изменения порядка"
      )
      return
    }

    console.log(
      `Изменение порядка элемента ${itemId} относительно ${targetId} в папке ${parentId}`
    )

    // Выполняем перестановку элементов в данных
    const result = await reorderBookmarks(itemId, targetId, parentId)

    if (result) {
      showNotification(getTranslation("DRAG_DROP.MOVE_SUCCESS"))
      console.log("Порядок элементов успешно изменен")
    } else {
      console.error("Не удалось изменить порядок элементов")
      // Обновляем представление, чтобы вернуть элементы в исходное состояние
      await refreshCurrentView()
    }
  } catch (error) {
    console.error("Ошибка при изменении порядка элементов:", error)
    await refreshCurrentView()
  }
}

/**
 * Обрабатывает перемещение элемента между папками
 * @param {HTMLElement} item - Перемещенный элемент
 * @param {HTMLElement} fromContainer - Исходный контейнер
 * @param {HTMLElement} toContainer - Целевой контейнер
 * @param {number} newIndex - Новая позиция в целевом контейнере
 */
async function handleItemMoved(item, fromContainer, toContainer, newIndex) {
  try {
    // Получаем ID перемещенного элемента
    const itemId = item.dataset.id

    // Получаем ID целевой папки
    // Если это тот же контейнер, используем метод reorderBookmarks
    if (fromContainer === toContainer) {
      return handleItemReordered(item, -1, newIndex)
    }

    // Иначе перемещаем элемент в другую папку
    // Определяем ID целевой папки
    const targetFolderId =
      toContainer.dataset.folderId ||
      (navigation.isRoot ? "0" : navigation.currentFolder?.id)

    if (!targetFolderId) {
      console.error("Не удалось определить ID целевой папки")
      await refreshCurrentView()
      return
    }

    console.log(`Перемещение элемента ${itemId} в папку ${targetFolderId}`)

    // Выполняем перемещение элемента в данных
    const result = await moveBookmark(itemId, targetFolderId)

    if (result) {
      showNotification(getTranslation("DRAG_DROP.MOVE_SUCCESS"))
      console.log("Элемент успешно перемещен в другую папку")
    } else {
      console.error("Не удалось переместить элемент в другую папку")
      // Обновляем представление, чтобы вернуть элементы в исходное состояние
      await refreshCurrentView()
    }
  } catch (error) {
    console.error("Ошибка при перемещении элемента между папками:", error)
    await refreshCurrentView()
  }
}

/**
 * Показывает временное уведомление
 * @param {string} message - Текст сообщения
 * @param {number} duration - Длительность показа в миллисекундах
 */
function showNotification(message, duration = 2000) {
  // Проверяем, нет ли уже уведомления
  let notification = document.querySelector(".notification")

  if (!notification) {
    // Создаем уведомление
    notification = document.createElement("div")
    notification.className = "notification"
    document.body.appendChild(notification)
  }

  // Устанавливаем текст и показываем
  notification.textContent = message
  notification.style.opacity = "1"

  // Скрываем через указанное время
  setTimeout(() => {
    notification.style.opacity = "0"
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification)
      }
    }, 300)
  }, duration)
}

/**
 * Получает перевод по ключу
 * @param {string} key - Ключ перевода
 * @returns {string} - Текст перевода
 */
function getTranslation(key) {
  return i18n.t(key)
}

/**
 * Создает элемент закладки или папки для отображения в интерфейсе
 * @param {Object} bookmark - Объект закладки или папки
 * @returns {HTMLElement} - Созданный элемент
 */
function createBookmarkElement(bookmark) {
  const bookmarkElement = document.createElement("div")
  bookmarkElement.className =
    bookmark.type === "folder" ? "bookmark-item folder" : "bookmark-item"
  bookmarkElement.dataset.id = bookmark.id
  bookmarkElement.dataset.type = bookmark.type

  // Для папок добавляем атрибут с текстом для перетаскивания
  if (bookmark.type === "folder") {
    bookmarkElement.dataset.dragText = getTranslation("DRAG_DROP.DROP_HERE")
  }

  // Создаем иконку
  const iconElement = document.createElement("img")
  iconElement.className = "bookmark-icon"

  if (bookmark.type === "folder") {
    // Для папок используем иконку папки или загруженную пользователем
    const iconUrl = localStorage.getItem(`folder_icon_${bookmark.id}`)
    iconElement.src = iconUrl || "assets/icons/folder_white.svg"
    iconElement.alt = "Folder"

    // Для темной темы используем другую иконку если нет кастомной
    if (!iconUrl) {
      iconElement.classList.add("theme-icon")

      // Создаем альтернативную иконку для светлой темы
      const lightIconElement = document.createElement("img")
      lightIconElement.className = "bookmark-icon light-theme-icon"
      lightIconElement.src = "assets/icons/folder_black.svg"
      lightIconElement.alt = "Folder"
      bookmarkElement.appendChild(lightIconElement)

      // Темную иконку делаем для темной темы
      iconElement.classList.add("dark-theme-icon")
    }
  } else {
    // Для закладок используем favicon или изображение по умолчанию
    iconElement.src = bookmark.favicon || "assets/icons/link.svg"
    iconElement.alt = "Bookmark"
    iconElement.onerror = function () {
      // Если не удалось загрузить favicon, показываем изображение по умолчанию
      this.src = "assets/icons/link.svg"
    }
  }

  // Создаем контейнер для заголовка
  const titleElement = document.createElement("div")
  titleElement.className = "bookmark-title"
  titleElement.textContent = bookmark.title

  // Добавляем элементы в закладку
  bookmarkElement.appendChild(iconElement)
  bookmarkElement.appendChild(titleElement)

  // Добавляем обработчик клика для папок
  if (bookmark.type === "folder") {
    bookmarkElement.addEventListener("click", function (e) {
      // Проверяем, не происходит ли перетаскивание
      if (!window.bookmarksSortable || !window.bookmarksSortable.dragging) {
        handleFolderClick(this)
      }
    })
  } else {
    // Для закладок добавляем ссылку
    bookmarkElement.addEventListener("click", function (e) {
      if (!window.bookmarksSortable || !window.bookmarksSortable.dragging) {
        // Открываем ссылку в новой вкладке
        chrome.tabs.create({ url: bookmark.url })
      }
    })
  }

  // Добавляем контекстное меню
  bookmarkElement.addEventListener("contextmenu", handleContextMenu)

  return bookmarkElement
}
