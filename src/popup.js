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

    // Делаем iconStorage доступным глобально
    window.iconStorage = iconStorage

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
      refreshCurrentView(true)
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
  const folderTitle =
    bookmarkElement.querySelector(`.bookmark-title`).textContent
  navigation.push({ id, title: folderTitle })

  if (currentNestedMenu) {
    currentNestedMenu.destroy()
  }

  // Проверяем, был ли перемещен элемент в эту папку
  const hasRecentMove =
    window.lastMovedItem &&
    window.lastMovedItem.targetFolder === id &&
    Date.now() - window.lastMovedItem.timestamp < 30000 // 30 секунд

  // Если был недавно перемещен элемент в эту папку, обновляем данные из хранилища
  const nestedBookmarks = await ErrorHandler.wrapAsync(
    getBookmarksInFolder(id, hasRecentMove),
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

    // Если был недавно перемещен элемент в эту папку, выделяем его
    if (hasRecentMove) {
      setTimeout(() => {
        const movedElement = document.querySelector(
          `[data-id="${window.lastMovedItem.itemId}"]`
        )
        if (movedElement) {
          movedElement.style.transition = "background-color 0.5s"
          movedElement.style.backgroundColor = "var(--highlight-color)"
          setTimeout(() => {
            movedElement.style.backgroundColor = ""
          }, 1500)
        }
        // Сбрасываем информацию о перемещении
        window.lastMovedItem = null
      }, 100)
    }
  } else {
    navigation.pop()
  }
}

// Функция обработки клика по кнопке "Назад"
async function handleBackButtonClick() {
  try {
    // Показываем индикатор загрузки
    showLoadingIndicator()

    // Очищаем таймеры
    clearHoverTimers()

    // Полностью очищаем кэш для всех папок, чтобы гарантировать получение свежих данных
    window._folderContentsCache = {}
    window._cachedBookmarks = null

    // Проверяем, есть ли папки в стеке навигации
    if (navigation.getStack().length > 0) {
      // Удаляем текущую папку из стека
      navigation.pop()

      if (navigation.getStack().length > 0) {
        // Если стек не пуст, берем последнюю папку
        const previousFolder = navigation.currentFolder
        currentParentId = previousFolder.id

        // Обновляем UI
        updateFolderTitle(previousFolder.title)
        toggleBackButton(true) // Продолжаем показывать кнопку назад

        console.log(
          `Возвращаемся в папку ${previousFolder.id}: ${previousFolder.title}`
        )

        // Принудительно получаем содержимое папки без кэширования (forceUpdate = true)
        const nestedBookmarks = await ErrorHandler.wrapAsync(
          getBookmarksInFolder(previousFolder.id, true),
          ErrorType.NAVIGATION,
          "folder"
        )

        if (nestedBookmarks) {
          // Очищаем и обновляем NestedMenu
          if (currentNestedMenu) {
            currentNestedMenu.destroy()
          }
          currentNestedMenu = new NestedMenu(mainContent, nestedBookmarks)
          await currentNestedMenu.render()

          console.log(
            `Отрисован NestedMenu с ${nestedBookmarks.length} элементами`
          )
        } else {
          // В случае ошибки возвращаемся в корень
          console.error(
            "Не удалось получить содержимое папки, возвращаемся в корень"
          )
          navigation.clear()
          currentParentId = "0"
          updateFolderTitle("Закладки")
          toggleBackButton(false)
          const freshBookmarks = await getAllBookmarks(true)
          mainInterface.bookmarks = freshBookmarks
          await mainInterface.render()
        }
      } else {
        // Вернулись в корневую папку
        currentParentId = "0"
        updateFolderTitle("Закладки")
        toggleBackButton(false) // Скрываем кнопку назад

        console.log("Возвращаемся в корневую папку")

        // Получаем свежие закладки и обновляем mainInterface
        const freshBookmarks = await getAllBookmarks(true)
        mainInterface.bookmarks = freshBookmarks
        await mainInterface.render()

        console.log(
          `Отрисован MainInterface с ${freshBookmarks.length} элементами`
        )
      }

      // Сохраняем текущее состояние навигации
      storage.set(STORAGE_KEYS.NAVIGATION, navigation.getStack())
    }
  } catch (error) {
    console.error("Ошибка при обработке кнопки назад:", error)
    showErrorMessage(i18n.t("ERROR.BACK_FAILED"))
  } finally {
    // Убираем индикатор загрузки
    hideLoadingIndicator()
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
  const title = bookmarkElement.querySelector(`.bookmark-title`).textContent
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
                await refreshCurrentView(true)
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
              await refreshCurrentView(true)
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
          await refreshCurrentView(true)
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
async function refreshCurrentView(forceUpdateCache = false) {
  const mainContent = document.querySelector(".main-content")
  const currentFolderTitle = document.querySelector(".current-folder")

  try {
    // Проверяем, нужно ли пропустить обновление
    if (window.preventRefreshAfterDrop) {
      console.log(
        "Обновление представления отложено после drag-and-drop операции"
      )
      return
    }

    // Проверяем, идет ли активное перетаскивание
    if (window.isDragging) {
      console.log(
        "Перетаскивание активно, откладываем обновление представления"
      )
      setTimeout(() => refreshCurrentView(forceUpdateCache), 100)
      return
    }

    // Если требуется принудительное обновление кэша, очищаем его для текущей папки
    if (forceUpdateCache && window._folderContentsCache) {
      const parentId = navigation.getCurrentParentId()
      console.log(`Очистка кэша для папки ${parentId} перед обновлением`)
      delete window._folderContentsCache[parentId]
    }

    // Отображаем лоадер при необходимости
    showLoadingIndicator()

    // Уничтожаем существующий экземпляр Sortable, если он есть
    if (window.sortableInstance) {
      try {
        window.sortableInstance.option("disabled", true)
        setTimeout(() => {
          try {
            window.sortableInstance.destroy()
          } catch (e) {
            console.warn("Ошибка при уничтожении Sortable:", e)
          }
          window.sortableInstance = null

          // Продолжаем обновление после уничтожения Sortable
          continueRefreshCurrentView(
            mainContent,
            currentFolderTitle,
            forceUpdateCache
          )
        }, 50)
      } catch (e) {
        console.warn("Ошибка при отключении Sortable:", e)
        window.sortableInstance = null
        continueRefreshCurrentView(
          mainContent,
          currentFolderTitle,
          forceUpdateCache
        )
      }
    } else {
      continueRefreshCurrentView(
        mainContent,
        currentFolderTitle,
        forceUpdateCache
      )
    }
  } catch (error) {
    console.error("Ошибка при обновлении представления:", error)
    showErrorMessage("Не удалось загрузить закладки")
    hideLoadingIndicator()
  }
}

/**
 * Вспомогательная функция для продолжения обновления представления
 */
async function continueRefreshCurrentView(
  mainContent,
  currentFolderTitle,
  forceUpdateCache = false
) {
  try {
    // Получаем текущий ID родительской папки
    const parentId = navigation.getCurrentParentId()
    console.log(
      `Обновление содержимого папки ${parentId}, forceUpdate=${forceUpdateCache}`
    )

    // Сохраняем текущие иконки для повторного использования
    const currentIcons = {}
    const existingIcons = mainContent.querySelectorAll(".bookmark-icon")
    existingIcons.forEach((icon) => {
      const itemElem = icon.closest(".bookmark-item")
      if (itemElem && itemElem.dataset.id) {
        if (!currentIcons[itemElem.dataset.id]) {
          currentIcons[itemElem.dataset.id] = []
        }
        // Сохраняем ссылку на иконку и её src
        // Нормализуем путь к иконке, добавляя / в начало, если его нет
        let src = icon.src
        if (src.includes("/assets/") && !src.includes("://assets/")) {
          // Если путь относительный без /, добавляем его
          src = src
            .replace("/assets/", "//assets/")
            .replace("//assets/", "/assets/")
        }

        currentIcons[itemElem.dataset.id].push({
          isLight: icon.classList.contains("light-theme-icon"),
          src: src,
          isLoaded: icon.complete && icon.naturalWidth > 0,
        })
      }
    })

    // Получаем закладки с потенциальным принудительным обновлением
    const forceUpdate =
      forceUpdateCache ||
      (window.lastMovedItem &&
        window.lastMovedItem.targetFolder === parentId &&
        Date.now() - window.lastMovedItem.timestamp < 30000)

    // Очищаем кеш содержимого папки, если требуется принудительное обновление
    if (forceUpdate && window._folderContentsCache) {
      delete window._folderContentsCache[parentId]
    }

    // Получаем закладки из хранилища (с принудительным обновлением если нужно)
    const bookmarks = await getBookmarksInFolder(parentId, forceUpdate)

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
    if (!bookmarks || bookmarks.length === 0) {
      const emptyMessage = document.createElement("div")
      emptyMessage.className = "empty-message"
      emptyMessage.textContent = navigation.isRoot
        ? getTranslation("MESSAGES.NO_BOOKMARKS")
        : getTranslation("MESSAGES.EMPTY_FOLDER")

      mainContent.appendChild(emptyMessage)
    } else {
      // Создаем элементы закладок/папок
      bookmarks.forEach((bookmark) => {
        const bookmarkElement = createBookmarkElement(
          bookmark,
          currentIcons[bookmark.id]
        )
        mainContent.appendChild(bookmarkElement)
      })
    }

    // Инициализируем Sortable после добавления элементов
    initDragAndDrop()

    // Если был перемещен элемент в эту папку, выделяем его
    if (forceUpdate && window.lastMovedItem) {
      setTimeout(() => {
        const movedElement = mainContent.querySelector(
          `[data-id="${window.lastMovedItem.itemId}"]`
        )
        if (movedElement) {
          movedElement.style.transition = "background-color 0.5s"
          movedElement.style.backgroundColor = "var(--highlight-color)"
          setTimeout(() => {
            movedElement.style.backgroundColor = ""
          }, 1500)
        }
        // Сбрасываем информацию о перемещении
        window.lastMovedItem = null
      }, 100)
    }
  } catch (error) {
    console.error("Ошибка при продолжении обновления представления:", error)
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

  // Добавляем поддержку перетаскивания на кнопку возврата
  setupBackButtonDropTarget()
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
      await refreshCurrentView(true)
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
      await refreshCurrentView(true)
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
  // Получаем иконку из IconStorage
  let savedIconUrl = null
  try {
    const iconBlob = await iconStorage.getIcon(folder.id)
    if (iconBlob) {
      savedIconUrl = URL.createObjectURL(iconBlob)
    }
  } catch (error) {
    console.error(`Ошибка при загрузке иконки для папки ${folder.id}:`, error)
  }

  const customContent = createFolderEditContent(folder, savedIconUrl)

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

function createFolderEditContent(folder, savedIconUrl) {
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
          savedIconUrl
            ? `<img src="${savedIconUrl}" alt="${i18n.t("LABELS.PREVIEW")}" />`
            : `<span data-translate="LABELS.NO_PREVIEW">${i18n.t(
                "LABELS.NO_PREVIEW"
              )}</span>`
        }
      </div>
    </div>
  `
  return customContent
}

async function handleFolderEdit(folder, customContent, modal) {
  const newTitle = customContent.querySelector("#folderTitle").value.trim()
  if (!newTitle) {
    alert(i18n.t("VALIDATIONS.FOLDER_NAME_REQUIRED"))
    return false
  }

  const previewContent = customContent.querySelector(".preview-content")
  const previewImg = previewContent.querySelector("img")
  const iconUrl = previewImg ? previewImg.src : null

  try {
    // Обновляем название папки
    const updateResult = await ErrorHandler.wrapAsync(
      updateFolder(folder.id, { title: newTitle }),
      ErrorType.UPDATE,
      "folder"
    )

    if (updateResult) {
      // Если есть новая иконка, сохраняем ее в IconStorage
      if (iconUrl) {
        try {
          // Получаем blob из URL
          const response = await fetch(iconUrl)
          const iconBlob = await response.blob()

          // Сохраняем в IconStorage
          await iconStorage.saveIcon(folder.id, iconBlob)
          console.log(
            `Иконка для папки ${folder.id} успешно сохранена в IconStorage`
          )
        } catch (iconError) {
          console.error("Ошибка при сохранении иконки:", iconError)
        }
      }

      modal.close()

      // Обновляем текущее представление
      await refreshCurrentView(true)
      return true
    }
    return false
  } catch (error) {
    console.error("Ошибка при обновлении папки:", error)
    alert(i18n.t("ERROR.UPDATE_FAILED"))
    return false
  }
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
    try {
      window.sortableInstance.destroy()
    } catch (e) {
      console.warn("Ошибка при уничтожении Sortable:", e)
    }
    window.sortableInstance = null
  }

  // Флаг для отслеживания активного перетаскивания
  window.isDragging = false
  // Флаг для предотвращения автоматического обновления интерфейса после перетаскивания
  window.preventRefreshAfterDrop = false

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
      window.isDragging = true
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

      // Устанавливаем флаг, чтобы предотвратить автоматическое обновление интерфейса
      window.preventRefreshAfterDrop = true

      // Запоминаем необходимые данные перед очисткой
      const draggedId = window.draggedItemId
      const draggedType = window.draggedItemType
      const oldIndex = evt.oldIndex
      const newIndex = evt.newIndex
      const fromEl = evt.from
      const toEl = evt.to
      const hasChanged = evt.newIndex !== evt.oldIndex || evt.to !== evt.from

      // Очищаем таймер и выделение папки
      if (folderHoverTimer) {
        clearTimeout(folderHoverTimer)
        folderHoverTimer = null
      }

      if (lastHoveredFolder) {
        lastHoveredFolder.classList.remove("highlight")
        lastHoveredFolder = null
      }

      // Удаляем класс dragging с тела документа
      document.body.classList.remove("dragging")

      // Устанавливаем небольшую задержку перед обработкой,
      // чтобы Sortable успел завершить свои операции
      setTimeout(async () => {
        window.isDragging = false

        // Если перемещение происходило между разными контейнерами
        if (hasChanged && fromEl !== toEl) {
          // Обрабатываем перемещение в другую папку
          try {
            const targetFolderId = toEl.dataset.folderId
            if (targetFolderId) {
              const result = await moveBookmark(draggedId, targetFolderId)
              if (result) {
                showNotification(getTranslation("DRAG_DROP.MOVE_SUCCESS"))
                // Сбрасываем кеш
                window._folderContentsCache = {}
                // Сохраняем информацию о последнем перемещении
                window.lastMovedItem = {
                  itemId: draggedId,
                  targetFolder: targetFolderId,
                  timestamp: Date.now(),
                }
              }
            }
          } catch (error) {
            console.error("Ошибка при перемещении между контейнерами:", error)
          }
        } else if (hasChanged) {
          // Если это изменение порядка внутри одного контейнера
          try {
            const currentFolderId = navigation.getCurrentParentId()

            // Получаем все элементы после перемещения для определения нового порядка
            const items = Array.from(fromEl.querySelectorAll(".bookmark-item"))
            console.log(
              `Элементы после перемещения: ${items.length}`,
              items.map((i) => i.dataset.id)
            )

            // Получаем актуальный порядок элементов после перемещения
            const newOrder = items.map((item) => item.dataset.id)

            // Находим перемещенный элемент
            const movedItemIndex = newOrder.indexOf(draggedId)
            if (movedItemIndex === -1) {
              console.error(
                "Не удалось найти перемещенный элемент в DOM после перемещения"
              )
              await refreshCurrentView(true)
              return
            }

            // Определяем, перед каким элементом вставить (или null, если в конец)
            let targetId = null
            if (movedItemIndex < newOrder.length - 1) {
              targetId = newOrder[movedItemIndex + 1]
            }

            console.log(
              `Переупорядочивание: элемент ${draggedId} перед элементом ${
                targetId || "конец списка"
              } в папке ${currentFolderId}`
            )

            // Вызываем функцию переупорядочивания с актуальными параметрами
            const result = await reorderBookmarks(
              draggedId,
              targetId,
              currentFolderId
            )

            if (result) {
              // Операция успешна
              showNotification(getTranslation("DRAG_DROP.MOVE_SUCCESS"))
              console.log("Порядок элементов успешно сохранен в хранилище")

              // Сбрасываем кеши для обеспечения актуальности данных при следующей загрузке
              if (window._folderContentsCache) {
                delete window._folderContentsCache[currentFolderId]
              }
            } else {
              console.error("Ошибка при сохранении нового порядка элементов")
              window.preventRefreshAfterDrop = false
              await refreshCurrentView(true)
            }
          } catch (error) {
            console.error("Ошибка при изменении порядка:", error)
            window.preventRefreshAfterDrop = false
            await refreshCurrentView(true)
          }
        }

        // Очищаем переменные
        window.draggedItemId = null
        window.draggedItemType = null

        // Сбрасываем флаг блокировки обновления и разрешаем дальнейшие операции
        setTimeout(() => {
          window.preventRefreshAfterDrop = false
        }, 100)
      }, 50)
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
          const draggedId = window.draggedItemId

          // Проверка, чтобы не перемещать папку в саму себя
          if (draggedId === folderId) {
            if (folderHoverTimer) {
              clearTimeout(folderHoverTimer)
              folderHoverTimer = null
            }
            if (lastHoveredFolder) {
              lastHoveredFolder.classList.remove("highlight")
              lastHoveredFolder = null
            }
            return
          }

          // Очищаем переменные и устанавливаем выделение перед перемещением
          folderHoverTimer = null
          if (lastHoveredFolder) {
            lastHoveredFolder.classList.remove("highlight")
            lastHoveredFolder = null
          }

          // Перемещаем элемент в папку после деактивации Sortable
          // для предотвращения конфликтов
          if (window.sortableInstance) {
            try {
              window.sortableInstance.option("disabled", true)
              setTimeout(() => {
                moveItemToFolder(draggedId, folderId)
                  .catch((error) => {
                    console.error("Ошибка при перемещении в папку:", error)
                    ErrorHandler.handle(
                      error,
                      ErrorType.MOVE,
                      window.draggedItemType || "bookmark"
                    )
                  })
                  .finally(() => {
                    if (window.sortableInstance) {
                      window.sortableInstance.option("disabled", false)
                    }
                  })
              }, 50)
            } catch (e) {
              console.warn("Ошибка при отключении Sortable:", e)
              // Если не удалось отключить, просто выполняем перемещение
              moveItemToFolder(draggedId, folderId).catch((error) => {
                console.error("Ошибка при перемещении в папку:", error)
                ErrorHandler.handle(
                  error,
                  ErrorType.MOVE,
                  window.draggedItemType || "bookmark"
                )
              })
            }
          } else {
            moveItemToFolder(draggedId, folderId).catch((error) => {
              console.error("Ошибка при перемещении в папку:", error)
              ErrorHandler.handle(
                error,
                ErrorType.MOVE,
                window.draggedItemType || "bookmark"
              )
            })
          }
        }, 800) // Задержка перед перемещением в папку
      }

      return true // Разрешаем перемещение
    },
  })

  console.log("Sortable.js инициализирован успешно")
}

/**
 * Обрабатывает завершение операции перетаскивания
 * @param {Object} dragInfo - Информация о перетаскивании
 * @param {string} dragInfo.movedItemId - ID перемещенного элемента
 * @param {boolean} dragInfo.success - Успешно ли выполнено перемещение
 * @param {string|null} dragInfo.targetFolderId - ID целевой папки (null если просто изменение порядка)
 */
function processDragEnd(dragInfo) {
  const { movedItemId, success, targetFolderId } = dragInfo

  // Если перемещение не удалось, просто обновляем текущее представление
  if (!success) {
    console.log("Перемещение не удалось, обновляем текущее представление")
    refreshCurrentView(true)
    return
  }

  // Получаем текущую папку
  const currentParentId = navigation.getCurrentParentId()

  // Если элемент был перемещен в другую папку (не в текущую)
  if (targetFolderId && targetFolderId !== currentParentId) {
    console.log(
      `Элемент ${movedItemId} перемещен в другую папку: ${targetFolderId}`
    )

    // Сохраняем информацию о последнем перемещении
    window.lastMovedItem = {
      itemId: movedItemId,
      targetFolder: targetFolderId,
      timestamp: Date.now(),
    }

    // Сбрасываем кеш содержимого папок для обеспечения актуальности данных
    window._folderContentsCache = {}

    // Обновляем текущее представление, так как элемент был удален из текущей папки
    refreshCurrentView(true)
  } else {
    // Если это было перемещение внутри текущей папки (изменение порядка)
    console.log(
      `Элемент ${movedItemId} был переупорядочен внутри текущей папки ${currentParentId}`
    )
    refreshCurrentView(true)
  }
}

// Функция обновления текущей папки (если её нет, добавим)
async function refreshCurrentFolder() {
  try {
    // Проверяем, нужно ли пропустить обновление
    if (window.preventRefreshAfterDrop) {
      console.log(
        "Обновление представления отложено после drag-and-drop операции"
      )
      return
    }

    // Проверяем, идет ли активное перетаскивание
    if (window.isDragging) {
      console.log(
        "Перетаскивание активно, откладываем обновление представления"
      )
      setTimeout(() => refreshCurrentFolder(), 100)
      return
    }

    // Отображаем лоадер при необходимости
    showLoadingIndicator()

    // Очищаем кеш текущей папки
    if (window._folderContentsCache) {
      const parentId = navigation.getCurrentParentId()
      delete window._folderContentsCache[parentId]
    }

    // Уничтожаем существующий экземпляр Sortable, если он есть
    if (window.sortableInstance) {
      try {
        window.sortableInstance.option("disabled", true)
        setTimeout(() => {
          try {
            window.sortableInstance.destroy()
          } catch (e) {
            console.warn("Ошибка при уничтожении Sortable:", e)
          }
          window.sortableInstance = null

          // Продолжаем обновление после уничтожения Sortable
          continueRefreshCurrentFolder()
        }, 50)
      } catch (e) {
        console.warn("Ошибка при отключении Sortable:", e)
        window.sortableInstance = null
        continueRefreshCurrentFolder()
      }
    } else {
      continueRefreshCurrentFolder()
    }
  } catch (error) {
    console.error("Ошибка при обновлении текущей папки:", error)
    showErrorMessage("Не удалось загрузить закладки")
    hideLoadingIndicator()
  }
}

// Вспомогательная функция для продолжения обновления текущей папки
async function continueRefreshCurrentFolder() {
  const currentFolderId = navigation.isRoot ? "0" : navigation.currentFolder?.id
  if (currentFolderId) {
    console.log(`Обновляем содержимое папки: ${currentFolderId}`)
    await refreshCurrentView(true) // Always force cache refresh
  } else {
    console.warn("ID текущей папки не определен")
  }
}

// Функция для перемещения элемента в папку
async function moveItemToFolder(itemId, folderId) {
  try {
    console.log(`Перемещаем элемент ${itemId} в папку ${folderId}`)

    // Если активно перетаскивание, деактивируем Sortable
    if (window.sortableInstance && window.isDragging) {
      try {
        window.sortableInstance.option("disabled", true)
      } catch (e) {
        console.warn("Ошибка при отключении Sortable:", e)
      }
    }

    // Сбрасываем кеш папок для обеспечения актуальных данных
    window._folderContentsCache = {}

    // Используем существующую функцию moveBookmark из bookmarks.js
    const result = await moveBookmark(itemId, folderId)

    if (result) {
      // Визуально удаляем элемент из текущего контейнера
      const element = document.querySelector(`[data-id="${itemId}"]`)
      if (element) {
        // Анимируем исчезновение элемента перед удалением
        element.style.transition = "opacity 0.3s, transform 0.3s"
        element.style.opacity = "0"
        element.style.transform = "scale(0.9)"

        // Удаляем элемент после анимации
        setTimeout(() => {
          if (element.parentNode) {
            element.parentNode.removeChild(element)
          }
        }, 300)
      }

      // Показываем уведомление об успешном перемещении
      showNotification(getTranslation("DRAG_DROP.MOVE_SUCCESS"))

      // Сохраняем информацию о последнем перемещении
      window.lastMovedItem = {
        itemId: itemId,
        targetFolder: folderId,
        timestamp: Date.now(),
      }

      // На всякий случай сбрасываем флаг блокировки обновления
      // после завершения операции перемещения
      setTimeout(() => {
        window.preventRefreshAfterDrop = false
      }, 500)
    }

    // Если Sortable был отключен, включаем его обратно
    if (window.sortableInstance) {
      try {
        window.sortableInstance.option("disabled", false)
      } catch (e) {
        console.warn("Ошибка при включении Sortable:", e)
      }
    }

    return result
  } catch (error) {
    console.error("Ошибка при перемещении элемента в папку:", error)

    // Если Sortable был отключен, включаем его обратно
    if (window.sortableInstance) {
      try {
        window.sortableInstance.option("disabled", false)
      } catch (e) {
        console.warn("Ошибка при включении Sortable:", e)
      }
    }

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

    if (!targetId || targetId === itemId) {
      console.error(
        "Не удалось определить целевой элемент для изменения порядка или целевой элемент совпадает с исходным"
      )
      await refreshCurrentView(true) // Обновляем представление для восстановления порядка
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

      // Принудительно обновляем представление, чтобы отобразить новый порядок
      // и избежать проблем с картинками
      await refreshCurrentView(true)
    } else {
      console.error("Не удалось изменить порядок элементов")
      // Обновляем представление, чтобы вернуть элементы в исходное состояние
      await refreshCurrentView(true)
    }
  } catch (error) {
    console.error("Ошибка при изменении порядка элементов:", error)
    await refreshCurrentView(true)
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
    window.preventRefreshAfterDrop = true

    const itemId = item.dataset.id
    const sourceContainerId = fromContainer.dataset.folderId || "0"
    const targetFolderId =
      toContainer.dataset.folderId ||
      (navigation.isRoot ? "0" : navigation.currentFolder?.id)

    if (!targetFolderId) {
      console.error("Не удалось определить ID целевой папки")
      await refreshCurrentView(true) // Принудительное обновление
      return
    }

    console.log(`Перемещение элемента ${itemId} в папку ${targetFolderId}`)

    // Сбрасываем кеш содержимого папок перед операцией
    window._folderContentsCache = {}

    // Выполняем перемещение элемента в данных
    const result = await moveBookmark(itemId, targetFolderId)

    if (result) {
      // Сохраняем информацию о последнем перемещении
      window.lastMovedItem = {
        itemId: itemId,
        targetFolder: targetFolderId,
        timestamp: Date.now(),
      }

      showNotification(getTranslation("DRAG_DROP.MOVE_SUCCESS"))
      console.log("Элемент успешно перемещен в другую папку")

      // Обновляем текущее представление
      await refreshCurrentView(true) // Принудительное обновление
    } else {
      console.error("Не удалось переместить элемент в другую папку")
      // Обновляем представление, чтобы вернуть элементы в исходное состояние
      await refreshCurrentView(true) // Принудительное обновление
    }
  } catch (error) {
    console.error("Ошибка при перемещении элемента между папками:", error)
    await refreshCurrentView(true) // Принудительное обновление
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
 * Создает DOM-элемент закладки или папки
 * @param {Object} item - Объект закладки или папки
 * @param {Array} cachedIcons - Массив объектов с информацией о кэшированных иконках
 * @returns {HTMLElement} - DOM-элемент закладки или папки
 */
function createBookmarkElement(item, cachedIcons = []) {
  // Создаем элемент div вместо li, чтобы соответствовать структуре в компонентах
  const element = document.createElement("div")
  element.className =
    item.type === "folder" ? "bookmark-item folder" : "bookmark-item"
  element.dataset.id = item.id
  element.dataset.type = item.type

  // Делаем элемент перетаскиваемым
  element.setAttribute("draggable", "true")

  if (item.url) {
    element.dataset.url = item.url
  }

  // Определяем источник иконки
  let iconSrc = ""
  const isDarkTheme = document.body.classList.contains(CSS_CLASSES.DARK_THEME)

  // Создаем иконку
  const icon = document.createElement("img")
  icon.className = "bookmark-icon"
  icon.alt = item.type

  // Установка иконок в зависимости от типа элемента и темы
  if (item.type === "folder") {
    // Для папок используем стандартные иконки в зависимости от темы
    iconSrc = isDarkTheme
      ? "/assets/icons/folder_black.svg"
      : "/assets/icons/folder_white.svg"
  } else {
    // Для закладок используем favicon или стандартную иконку
    iconSrc = item.favicon ? item.favicon : "/assets/icons/link.svg"
  }

  icon.src = iconSrc

  // Обработчик ошибки загрузки иконки
  icon.onerror = function () {
    if (item.type === "folder") {
      icon.src = isDarkTheme
        ? "/assets/icons/folder_black.svg"
        : "/assets/icons/folder_white.svg"
    } else {
      icon.src = "/assets/icons/link.svg"
    }
  }

  // Если это папка, попробуем загрузить кастомную иконку асинхронно
  if (item.type === "folder") {
    // Асинхронно попытаемся загрузить иконку из IconStorage
    setTimeout(async () => {
      try {
        const iconStorage = window.iconStorage
        if (iconStorage) {
          const iconBlob = await iconStorage.getIcon(item.id)
          if (iconBlob) {
            icon.src = URL.createObjectURL(iconBlob)
            return
          }
        }
      } catch (error) {
        console.error("Ошибка при загрузке иконки папки:", error)
      }
    }, 0)
  }

  // Заголовок закладки
  const title = document.createElement("span")
  title.className = "bookmark-title"
  title.textContent = item.title

  // Добавляем элементы в структуру
  element.appendChild(icon)
  element.appendChild(title)

  return element
}

/**
 * Обрабатывает клики по кнопкам в элементе закладки
 * @param {Event} e - Событие клика
 */
async function handleButtonClick(e) {
  e.preventDefault()
  e.stopPropagation()

  const action = e.target.closest("[data-action]")?.dataset.action
  if (!action) return

  const bookmarkItem = e.target.closest(".bookmark-item")
  if (!bookmarkItem) return

  const id = bookmarkItem.dataset.id
  const isFolder = bookmarkItem.classList.contains("folder")
  const title = bookmarkItem.querySelector(".bookmark-text").textContent
  const url = bookmarkItem.dataset.url

  switch (action) {
    case "edit":
      if (isFolder) {
        showFolderEditDialog({
          id: id,
          title: title,
        })
      } else {
        const modal = new Modal()
        modal.show(
          getTranslation("MODALS.EDIT_BOOKMARK"),
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
              await refreshCurrentView(true)
            }
          }
        )
      }
      break

    case "delete":
      if (confirm(getTranslation("CONFIRM_DELETE"))) {
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
            await refreshCurrentView(true)
          } else {
            alert(getTranslation("ERROR.DELETE_FAILED"))
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
  }
}

// Добавим после initializeUI
function setupBackButtonDropTarget() {
  const backButton = document.getElementById("backButton")
  if (!backButton) return

  // Добавляем обработчики для кнопки возврата
  backButton.addEventListener("dragover", (e) => {
    // Предотвращаем стандартное поведение для разрешения drop
    e.preventDefault()
    e.stopPropagation()

    // Только если мы не в корне и идет перетаскивание
    if (!navigation.isRoot && window.draggedItemId) {
      backButton.classList.add("drag-over")
      e.dataTransfer.dropEffect = "move"
    }
  })

  backButton.addEventListener("dragleave", () => {
    backButton.classList.remove("drag-over")
  })

  backButton.addEventListener("drop", async (e) => {
    e.preventDefault()
    e.stopPropagation()
    backButton.classList.remove("drag-over")

    // Проверяем, что есть ID перетаскиваемого элемента и мы не в корне
    if (window.draggedItemId && !navigation.isRoot) {
      // Получаем родительскую папку текущей папки
      const stack = navigation.getStack()
      let parentFolderId = "0"

      // Если в стеке больше одного элемента, берем ID предыдущего
      if (stack.length > 1) {
        parentFolderId = stack[stack.length - 2].id
      }

      // Отключаем Sortable перед операцией перемещения
      if (window.sortableInstance) {
        try {
          window.sortableInstance.option("disabled", true)
        } catch (e) {
          console.warn("Ошибка при отключении Sortable:", e)
        }
      }

      // Перемещаем элемент в родительскую папку
      try {
        const draggedItemId = window.draggedItemId
        // Очищаем переменные перетаскивания перед операцией
        window.draggedItemId = null
        window.draggedItemType = null
        window.isDragging = false

        await moveBookmark(draggedItemId, parentFolderId)
        showNotification(getTranslation("DRAG_DROP.MOVE_SUCCESS"))

        // Если мы находимся в папке, которую перетаскиваем, переходим назад
        if (draggedItemId === navigation.currentFolder?.id) {
          await handleBackButtonClick()
        } else {
          // Иначе просто обновляем текущий вид
          await refreshCurrentView(true)
        }
      } catch (error) {
        console.error("Ошибка при перемещении элемента на уровень выше:", error)
        ErrorHandler.handle(error, ErrorType.MOVE, "bookmark")
      } finally {
        // Включаем Sortable после операции
        if (window.sortableInstance) {
          try {
            window.sortableInstance.option("disabled", false)
          } catch (e) {
            console.warn("Ошибка при включении Sortable:", e)
          }
        }
      }
    }
  })
}

/**
 * Обрабатывает событие drop для перетаскиваемых элементов
 * @param {DragEvent} evt - событие drop
 */
async function handleDrop(evt) {
  // Проверяем, что перетаскивание было инициировано и у нас есть перетаскиваемый элемент
  if (!isDragging || !draggedElement) {
    return
  }

  // Очищаем таймеры и эффекты перед обработкой
  clearHoverTimer()
  clearAllHighlights()
  hideDropIndicator()

  // Создаем объект информации о перетаскивании с начальным результатом "неуспешно"
  const dragInfo = {
    movedItemId: draggedElement.dataset.id,
    success: false,
    targetFolderId: null,
  }

  try {
    evt.preventDefault()
    evt.stopPropagation()

    // Получаем целевой элемент
    const target = getDropTarget(evt)

    // Если цель - папка
    if (target && target.classList.contains("folder")) {
      const targetFolderId = target.dataset.id

      // Вызываем функцию для перемещения закладки в папку
      const success = await ErrorHandler.wrapAsync(async () => {
        return await moveBookmark(draggedElement.dataset.id, targetFolderId)
      })

      // Обновляем информацию о перетаскивании
      dragInfo.success = success
      dragInfo.targetFolderId = targetFolderId

      console.log(
        `Перемещение в папку ${targetFolderId}: ${
          success ? "успешно" : "неудачно"
        }`
      )
    }
    // Если перетаскивание происходит рядом с элементом (изменение порядка)
    else if (dropPosition.target) {
      const { targetId, position } = dropPosition

      // Получаем индексы для перестановки
      const oldIndex = Array.from(bookmarksContainer.children).indexOf(
        draggedElement
      )
      const targetElement = document.querySelector(
        `.bookmark-item[data-id="${targetId}"]`
      )
      let newIndex = Array.from(bookmarksContainer.children).indexOf(
        targetElement
      )

      // Корректируем новый индекс в зависимости от позиции
      if (position === "after" && newIndex < oldIndex) {
        newIndex += 1
      } else if (position === "before" && newIndex > oldIndex) {
        newIndex -= 1
      }

      // Перемещаем элемент в DOM
      const currentParentId = navigation.getCurrentParentId()
      const success = await reorderBookmarks(
        draggedElement.dataset.id,
        currentParentId,
        newIndex
      )

      // Обновляем информацию о перетаскивании
      dragInfo.success = success
      dragInfo.targetFolderId = currentParentId

      console.log(
        `Изменение порядка в папке ${currentParentId}: ${
          success ? "успешно" : "неудачно"
        }`
      )
    }
  } catch (error) {
    console.error("Ошибка при обработке drop:", error)
    dragInfo.success = false
  } finally {
    // Всегда вызываем processDragEnd, передавая результаты операции
    processDragEnd(dragInfo)
    resetDragging()
  }

  // После операции перетаскивания
  if (dragInfo.success) {
    await refreshCurrentView(true) // Принудительное обновление
  } else {
    await refreshCurrentView(true) // Принудительное обновление
  }
}

/**
 * Скрывает страницу настроек и возвращает к основному интерфейсу,
 * обновляя данные
 */
async function hideSettingsPage() {
  const settingsPage = document.getElementById(DOM_IDS.SETTINGS_PAGE)
  settingsPage.style.display = "none"
  document.getElementById(DOM_IDS.MAIN_CONTAINER).style.display = "block"
  document.getElementById(DOM_IDS.SETTINGS_BUTTON).style.display = "block"

  // Очищаем кеш при возврате из настроек
  if (window._folderContentsCache) {
    // Очищаем кеш для корневой папки
    if (window._folderContentsCache["0"]) {
      delete window._folderContentsCache["0"]
    }

    // Очищаем кеш для текущей папки, если мы находимся в ней
    if (
      !navigation.isRoot &&
      navigation.currentFolder &&
      window._folderContentsCache[navigation.currentFolder.id]
    ) {
      delete window._folderContentsCache[navigation.currentFolder.id]
    }
  }

  // Обновляем данные главного интерфейса
  if (navigation.isEmpty()) {
    const bookmarks = await getAllBookmarks()
    mainInterface.bookmarks = bookmarks
    mainInterface.render()
  } else {
    // Если мы находимся в папке, обновляем данные для текущей папки
    refreshCurrentView(true)
  }
}

/**
 * Скрывает страницу корзины и возвращает к основному интерфейсу,
 * обновляя данные
 */
async function hideTrashPage() {
  const trashPage = document.getElementById(DOM_IDS.TRASH_PAGE)
  trashPage.style.display = "none"
  document.getElementById(DOM_IDS.MAIN_CONTAINER).style.display = "block"
  document.getElementById(DOM_IDS.TRASH_BUTTON).style.display = "block"

  // Очищаем кеш при возврате из корзины
  if (window._folderContentsCache) {
    // Очищаем кеш для корневой папки
    if (window._folderContentsCache["0"]) {
      delete window._folderContentsCache["0"]
    }

    // Очищаем кеш для текущей папки, если мы находимся в ней
    if (
      !navigation.isRoot &&
      navigation.currentFolder &&
      window._folderContentsCache[navigation.currentFolder.id]
    ) {
      delete window._folderContentsCache[navigation.currentFolder.id]
    }
  }

  // Обновляем данные главного интерфейса
  if (navigation.isEmpty()) {
    const bookmarks = await getAllBookmarks()
    mainInterface.bookmarks = bookmarks
    mainInterface.render()
  } else {
    // Если мы находимся в папке, обновляем данные для текущей папки
    refreshCurrentView(true)
  }
}

// Очистка всех таймеров наведения
function clearHoverTimers() {
  if (folderHoverTimer) {
    clearTimeout(folderHoverTimer)
    folderHoverTimer = null
  }

  // Очистка других возможных таймеров
  if (window.highlightTimer) {
    clearTimeout(window.highlightTimer)
    window.highlightTimer = null
  }
}

// Обновляет заголовок текущей папки
function updateFolderTitle(title) {
  const currentFolder = document.getElementById(DOM_IDS.CURRENT_FOLDER)
  if (currentFolder) {
    currentFolder.textContent = title
    currentFolder.style.display = title ? "block" : "none"
  }
}

// Показывает или скрывает кнопку назад
function toggleBackButton(show) {
  const backButton = document.getElementById(DOM_IDS.BACK_BUTTON)
  if (backButton) {
    backButton.style.display = show ? "block" : "none"
  }
}
