import {
  getAllBookmarks,
  createBookmark,
  createFolder,
  createNote,
  getBookmarksInFolder,
  updateBookmark,
  updateNote,
  deleteBookmark,
  copyBookmark,
  updateFolder,
  moveBookmark,
  reorderBookmarks,
} from "./utils/bookmarks.js"
import { initTheme } from "./utils/theme.js"
import { MainInterface } from "./components/MainInterface.js"
import { NestedMenu } from "./components/NestedMenu.js"
import { Modal } from "./components/Modal.js"
import { storage } from "./utils/storage.js"
import { Navigation } from "./utils/navigation.js"
import { ErrorHandler, ErrorType } from "./utils/errorHandler.js"
import { i18n } from "./utils/i18n.js"
import { log, logError, logWarn } from "./utils/logging.js"
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
import { NavigationModule } from "./modules/NavigationModule.js"
import { UIModule } from "./modules/UIModule.js"
import { DragDropModule } from "./modules/DragDropModule.js"
import { ContextMenuModule } from "./modules/ContextMenuModule.js"
import { ContextMenu } from "./components/ContextMenu.js"
import { NoteModal } from "./components/NoteModal.js"

// Глобальные переменные
let mainContent
let currentParentId = "0" // ID текущей родительской папки

// Объекты модулей
let navigationModule
let uiModule
let dragDropModule
let contextMenuModule

// Глобальная переменная для контекстного меню
let globalContextMenu = null

// Инициализация темы
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await iconStorage.init()
    await iconStorage.migrateFromStorage()

    // Делаем iconStorage доступным глобально
    window.iconStorage = iconStorage

    initTheme()

    await i18n.initLocale()
    await initializeUI()
    translatePage()

    // Подписываемся на изменения языка
    i18n.addListener(() => {
      translatePage()
      refreshCurrentView(true)
    })
  } catch (error) {
    logError("Ошибка инициализации:", error)
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

// Функция обновления интерфейса
function updateUI(bookmarks, folderId, folderTitle) {
  if (uiModule) {
    return uiModule.render(bookmarks, folderId, folderTitle)
  } else {
    logError("Модуль UIModule не инициализирован")
    return null
  }
}

// Функция обработки клика по кнопке "Назад"
async function handleBackButtonClick() {
  if (navigationModule) {
    await navigationModule.handleBackButtonClick()
  } else {
    logError("Модуль NavigationModule не инициализирован")
  }
}

// Показываем индикатор загрузки
function showLoadingIndicator() {
  if (uiModule) {
    uiModule.showLoadingIndicator()
  } else {
    // Запасной вариант если uiModule еще не инициализирован
    let loader = document.querySelector(".loader")
    if (!loader) {
      loader = document.createElement("div")
      loader.className = "loader"
      document.body.appendChild(loader)
    }
    loader.style.display = "block"
  }
}

// Скрываем индикатор загрузки
function hideLoadingIndicator() {
  if (uiModule) {
    uiModule.hideLoadingIndicator()
  } else {
    // Запасной вариант если uiModule еще не инициализирован
    const loader = document.querySelector(".loader")
    if (loader) {
      loader.style.display = "none"
    }
  }
}

// Показываем сообщение об ошибке
function showErrorMessage(message) {
  if (uiModule) {
    uiModule.showErrorMessage(message)
  } else {
    // Запасной вариант если uiModule еще не инициализирован
    alert(message)
  }
}

/**
 * Инициализирует пользовательский интерфейс и модули
 */
async function initializeUI() {
  try {
    // Инициализируем основной контейнер
    mainContent = document.getElementById("mainContent")
    if (!mainContent) {
      throw new Error("Не удалось найти элемент mainContent")
    }

    // Сначала инициализируем UI модуль
    uiModule = new UIModule(mainContent, null)

    // Затем инициализируем модуль навигации и передаем функцию обновления UI
    navigationModule = new NavigationModule(mainContent, updateUI)

    // Обновляем ссылку на navigationModule в uiModule
    if (uiModule) {
      uiModule.navigationModule = navigationModule
    }

    // Восстанавливаем предыдущее состояние навигации
    const savedNavigation = await storage.get(STORAGE_KEYS.NAVIGATION)

    // Загружаем закладки на основе навигации
    if (
      savedNavigation &&
      Array.isArray(savedNavigation) &&
      savedNavigation.length > 0
    ) {
      navigationModule.setStack(savedNavigation)

      // Обновляем UI на основе сохраненной навигации
      const currentFolder = navigationModule.getNavigation().currentFolder
      if (currentFolder) {
        currentParentId = currentFolder.id
        const nestedBookmarks = await getBookmarksInFolder(currentFolder.id)
        updateUI(nestedBookmarks, currentFolder.id, currentFolder.title)
      }
    } else {
      // Загружаем корневые закладки
      const bookmarks = await getAllBookmarks()
      updateUI(bookmarks, "0", "Закладки")
    }

    // Инициализируем drag-and-drop модуль
    dragDropModule = new DragDropModule(mainContent, uiModule, navigationModule)

    // Инициализируем обработчики событий
    initEventListeners()

    // Добавляем обработчик для контекстного меню напрямую
    mainContent.addEventListener("contextmenu", handleContextMenu)

    // Скрываем индикатор загрузки после инициализации
    hideLoadingIndicator()
  } catch (error) {
    logError("Ошибка при инициализации интерфейса:", error)
    showErrorMessage(i18n.t("ERROR.INITIALIZATION_FAILED"))
  }
}

/**
 * Инициализирует обработчики событий
 */
function initEventListeners() {
  // Глобальное событие для обновления представления
  window.addEventListener("refresh-view", (e) => {
    const forceUpdate = e.detail && e.detail.force === true
    refreshCurrentView(forceUpdate)
  })

  // Обработчик клика на кнопке настроек
  const settingsButton = document.getElementById(DOM_IDS.SETTINGS_BUTTON)
  if (settingsButton) {
    settingsButton.addEventListener("click", () => {
      // Сохраняем текущий путь навигации
      const navigationState = {
        stack: navigationModule.getNavigation().getStack(),
      }
      chrome.storage.local.set({ navigationState }, () => {
        window.location.href = "settings.html"
      })
    })
  }

  // Обработчик клика на кнопке корзины
  const trashButton = document.getElementById(DOM_IDS.TRASH_BUTTON)
  if (trashButton) {
    trashButton.addEventListener("click", () => {
      // Сохраняем текущий путь навигации
      const navigationState = {
        stack: navigationModule.getNavigation().getStack(),
      }
      chrome.storage.local.set({ navigationState }, () => {
        window.location.href = "trash.html"
      })
    })
  }

  // Обработчик переключения темы
  const themeToggle = document.getElementById(DOM_IDS.THEME_TOGGLE)
  if (themeToggle) {
    themeToggle.addEventListener("change", handleThemeToggle)
  }

  // Обработчик кнопки добавления элементов
  const addButton = document.getElementById("addButton")
  if (addButton) {
    addButton.addEventListener("click", () => {
      // Проверяем доступность navigationModule и получаем актуальный ID родительской папки
      if (navigationModule) {
        currentParentId = navigationModule.getCurrentParentId()
        log(
          `Обновлен ID родительской папки перед открытием диалога: ${currentParentId}`
        )
      }

      showAddDialog(currentParentId)
    })
  }
}

/**
 * Обновляет текущее представление
 */
async function refreshCurrentView(forceUpdateCache = false) {
  // Показываем индикатор загрузки
  showLoadingIndicator()

  try {
    // Если drag-and-drop в процессе, и установлен флаг блокировки обновления
    if (window.isDragging || window.preventRefreshAfterDrop) {
      logWarn("Обновление отложено из-за активного drag-and-drop")
      // Скрываем индикатор загрузки
      hideLoadingIndicator()
      return
    }

    // Проверяем, что модули инициализированы
    if (!navigationModule || !uiModule) {
      logError("Модули не инициализированы")
      hideLoadingIndicator()
      return
    }

    // Обновляем содержимое текущей папки
    const currentStack = navigationModule.getNavigation().getStack()
    const isRoot = currentStack.length === 0

    if (isRoot) {
      // Корневой уровень - получаем все закладки
      currentParentId = "0"
      const bookmarks = await getAllBookmarks(forceUpdateCache)

      // Обновляем заголовок
      navigationModule.updateFolderTitle("Закладки")

      // Отображаем корневой уровень
      updateUI(bookmarks, "0", "Закладки")
    } else {
      // Вложенный уровень - получаем содержимое текущей папки
      const currentFolder = navigationModule.getNavigation().currentFolder
      if (currentFolder) {
        currentParentId = currentFolder.id

        // Обновляем заголовок
        navigationModule.updateFolderTitle(currentFolder.title)

        // Получаем закладки для текущей папки
        const bookmarks = await getBookmarksInFolder(
          currentFolder.id,
          forceUpdateCache
        )

        // Отображаем вложенный уровень
        updateUI(bookmarks, currentFolder.id, currentFolder.title)
      }
    }

    // Сохраняем текущее состояние навигации
    storage.set(
      STORAGE_KEYS.NAVIGATION,
      navigationModule.getNavigation().getStack()
    )
  } catch (error) {
    logError("Ошибка при обновлении:", error)
    showErrorMessage(i18n.t("ERROR.UPDATE_FAILED"))
  } finally {
    // Скрываем индикатор загрузки
    hideLoadingIndicator()
  }
}

// Переключает тему оформления
async function handleThemeToggle(e) {
  const isDark = e.target.checked
  document.body.classList.toggle("dark-theme", isDark)
  document.body.setAttribute("data-theme", isDark ? "dark" : "light")

  // Сохраняем выбранную тему
  await chrome.storage.local.set({ isDarkTheme: isDark })

  // Обновляем интерфейс с новой темой
  refreshCurrentView()
}

/**
 * Обрабатывает событие контекстного меню
 * @param {MouseEvent} e - Событие клика правой кнопкой мыши
 */
async function handleContextMenu(e) {
  e.preventDefault()

  // Находим элемент закладки или папки, на котором был сделан клик
  const bookmarkElement = e.target.closest(".bookmark-item")

  // Если клик был не на закладке, выходим
  if (!bookmarkElement) {
    if (globalContextMenu) {
      globalContextMenu.close()
    }
    return
  }

  // Получаем данные о элементе
  const isFolder = bookmarkElement.classList.contains("folder")
  const isNote = bookmarkElement.classList.contains("note")
  const id = bookmarkElement.dataset.id
  const title = bookmarkElement.querySelector(".bookmark-title").textContent
  const url = bookmarkElement.dataset.url
  const content = bookmarkElement.dataset.content
  const createdAt = bookmarkElement.dataset.createdAt
    ? parseInt(bookmarkElement.dataset.createdAt)
    : null

  // Определяем набор пунктов меню в зависимости от типа элемента
  let items
  if (isFolder) {
    items = CONTEXT_MENU_CONFIG.FOLDER
  } else if (isNote) {
    items = CONTEXT_MENU_CONFIG.NOTE
  } else {
    items = CONTEXT_MENU_CONFIG.BOOKMARK
  }

  // Создаем объект контекстного меню или используем существующий
  if (!globalContextMenu) {
    globalContextMenu = new ContextMenu()
  } else {
    globalContextMenu.close() // Закрываем предыдущее меню перед открытием нового
  }

  // Показываем контекстное меню
  globalContextMenu.show(
    e.pageX,
    e.pageY,
    items,
    bookmarkElement,
    async (action) => {
      switch (action) {
        case "rename":
        case "edit":
          if (isFolder) {
            showFolderEditDialog({
              id: id,
              title: title,
            })
          } else if (isNote) {
            showNoteEditDialog({
              id: id,
              title: title,
              content: content,
              createdAt: createdAt,
            })
          } else {
            const modal = new Modal()
            modal.show(
              i18n.t("MODALS.EDIT_BOOKMARK"),
              "link",
              { title, url },
              async (data) => {
                try {
                  log("Обработчик сохранения с данными:", data)

                  // Обновляем закладку
                  const result = await ErrorHandler.wrapAsync(
                    updateBookmark(id, data),
                    ErrorType.UPDATE,
                    "bookmark"
                  )

                  if (result) {
                    modal.close()

                    // Обновляем интерфейс
                    refreshCurrentView(true)
                    return true
                  } else {
                    logError("Не удалось обновить закладку", result)
                    return false
                  }
                } catch (error) {
                  logError("Ошибка при обновлении закладки:", error)
                  return false
                }
              }
            )
          }
          break

        case "delete":
          if (confirm(i18n.t("CONFIRM_DELETE"))) {
            try {
              // Создаем объект для сохранения в корзину
              let itemToTrash = {
                id,
                type: isFolder ? "folder" : isNote ? "note" : "bookmark",
                title,
                url,
                content,
              }

              // Если это заметка, сохраняем дату создания
              if (isNote && createdAt) {
                itemToTrash.createdAt = createdAt
              }

              // Если это папка, получаем её содержимое рекурсивно
              if (isFolder) {
                const folderContents = await getFolderContentsRecursively(id)
                itemToTrash.contents = folderContents
              }

              // Получаем стек навигации
              const navigationStack = navigationModule
                .getNavigation()
                .getStack()

              // Сохраняем в корзину перед удалением
              await trashStorage.moveToTrash(itemToTrash, navigationStack)

              // Удаляем из закладок
              const deleted = await ErrorHandler.wrapAsync(
                deleteBookmark(id),
                ErrorType.DELETE,
                isFolder ? "folder" : isNote ? "note" : "bookmark"
              )

              if (deleted) {
                // Обновляем интерфейс
                refreshCurrentView(true)
              } else {
                uiModule.showErrorMessage(i18n.t("ERROR.DELETE_FAILED"))
              }
            } catch (error) {
              logError("Ошибка при удалении элемента:", error)
              ErrorHandler.handle(
                error,
                ErrorType.DELETE,
                isFolder ? "folder" : isNote ? "note" : "bookmark"
              )
            }
          }
          break

        case "copy":
          try {
            // Закрываем контекстное меню
            globalContextMenu.close()

            // Получаем ID текущей папки
            const currentFolderId = navigationModule.getCurrentParentId()

            // Копируем элемент
            const result = await ErrorHandler.wrapAsync(
              copyBookmark(id, currentFolderId),
              ErrorType.COPY,
              isFolder ? "folder" : isNote ? "note" : "bookmark"
            )

            if (result) {
              uiModule.showNotification(i18n.t("CONTEXT_MENU.COPY_SUCCESS"))

              // Обновляем интерфейс
              refreshCurrentView(true)
            }
          } catch (error) {
            logError("Ошибка при копировании элемента:", error)
          }
          break

        default:
          logError("Неизвестное действие контекстного меню:", action)
      }
    }
  )
}

/**
 * Показывает диалог редактирования папки
 * @param {Object} folder - Информация о папке для редактирования
 */
async function showFolderEditDialog(folder) {
  log("Редактирование папки:", folder.id, folder.title)

  try {
    // Создаем модальное окно
    const modal = new Modal()

    // Создаем пользовательский контент для модального окна
    const customContent = document.createElement("div")
    customContent.className = "folder-edit-content"

    // Группа ввода для названия папки
    const nameGroup = document.createElement("div")
    nameGroup.className = "modal-input-group"

    const nameLabel = document.createElement("label")
    nameLabel.htmlFor = "name"
    nameLabel.textContent = i18n.t("LABELS.FOLDER_NAME")

    const nameInput = document.createElement("input")
    nameInput.id = "name"
    nameInput.type = "text"
    nameInput.value = folder.title

    nameGroup.appendChild(nameLabel)
    nameGroup.appendChild(nameInput)
    customContent.appendChild(nameGroup)

    // Загрузка иконки
    const iconGroup = document.createElement("div")
    iconGroup.className = "modal-input-group"

    const iconLabel = document.createElement("label")
    iconLabel.textContent = i18n.t("LABELS.UPLOAD_ICON")
    iconGroup.appendChild(iconLabel)

    // Отображаем текущую иконку
    let currentIconUrl = null
    try {
      const iconBlob = await iconStorage.getIcon(folder.id)
      if (iconBlob) {
        currentIconUrl = URL.createObjectURL(iconBlob)
      }
    } catch (error) {
      logError("Ошибка при получении иконки:", error)
    }

    // Предпросмотр иконки
    const iconPreview = document.createElement("div")
    iconPreview.className = "icon-preview"

    const iconImg = document.createElement("img")
    iconImg.className = "folder-icon-preview"

    // Определяем иконку в зависимости от текущей темы
    const isDarkTheme =
      document.body.classList.contains("dark-theme") ||
      document.body.getAttribute("data-theme") === "dark"
    iconImg.src =
      currentIconUrl || (isDarkTheme ? ICONS.FOLDER.DARK : ICONS.FOLDER.LIGHT)

    iconImg.onerror = () => {
      iconImg.src = isDarkTheme ? ICONS.FOLDER.DARK : ICONS.FOLDER.LIGHT
    }

    iconPreview.appendChild(iconImg)

    // Кнопка загрузки иконки
    const fileInputContainer = document.createElement("div")
    fileInputContainer.className = "file-input-container"

    const fileLabel = document.createElement("label")
    fileLabel.className = "file-input-label"
    fileLabel.htmlFor = "icon-upload"
    fileLabel.textContent = i18n.t("LABELS.UPLOAD_ICON")

    const fileInput = document.createElement("input")
    fileInput.type = "file"
    fileInput.id = "icon-upload"
    fileInput.className = "icon-upload"
    fileInput.accept = "image/*"

    // Переменная для хранения выбранного файла иконки
    let selectedIcon = null

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0]
      if (file) {
        selectedIcon = file
        // Оптимизируем и показываем выбранную иконку
        const optimizedImage = await optimizeImage(file)
        iconImg.src = URL.createObjectURL(optimizedImage)
      }
    })

    fileInputContainer.appendChild(fileLabel)
    fileInputContainer.appendChild(fileInput)

    iconGroup.appendChild(iconPreview)
    iconGroup.appendChild(fileInputContainer)
    customContent.appendChild(iconGroup)

    // Показываем диалог редактирования папки
    modal.show(
      i18n.t("MODALS.EDIT_FOLDER"),
      "folder",
      null,
      async () => {
        try {
          const titleValue = nameInput.value.trim()

          if (!titleValue) {
            alert(i18n.t("VALIDATIONS.EMPTY_FOLDER_NAME"))
            return false
          }

          // Обновляем папку
          const result = await ErrorHandler.wrapAsync(
            updateFolder(folder.id, { title: titleValue }),
            ErrorType.UPDATE,
            "folder"
          )

          if (result) {
            // Если была выбрана новая иконка, сохраняем ее
            if (selectedIcon) {
              try {
                const optimizedIcon = await optimizeImage(selectedIcon)
                await iconStorage.saveIcon(folder.id, optimizedIcon)
              } catch (iconError) {
                logError("Ошибка при сохранении иконки:", iconError)
              }
            }

            modal.close()

            // Обновляем интерфейс
            refreshCurrentView(true)
            return true
          } else {
            logError("Не удалось обновить папку", result)
            return false
          }
        } catch (error) {
          logError("Ошибка при обновлении папки:", error)
          return false
        }
      },
      null,
      customContent
    )
  } catch (error) {
    logError("Ошибка при создании диалога редактирования папки:", error)
  }
}

/**
 * Оптимизирует изображение для использования в качестве иконки
 * @param {File} file - Файл изображения
 * @returns {Promise<Blob>} - Оптимизированное изображение
 */
async function optimizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      const img = new Image()

      img.onload = () => {
        try {
          // Создаем canvas и масштабируем изображение
          const canvas = document.createElement("canvas")
          const MAX_SIZE = 64 // Максимальный размер иконки

          let width = img.width
          let height = img.height

          // Масштабируем, сохраняя пропорции
          if (width > height && width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width)
            width = MAX_SIZE
          } else if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height)
            height = MAX_SIZE
          }

          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext("2d")
          ctx.drawImage(img, 0, 0, width, height)

          // Конвертируем в Blob с меньшим качеством
          canvas.toBlob((blob) => {
            resolve(blob)
          }, "image/png")
        } catch (err) {
          reject(err)
        }
      }

      img.onerror = () => {
        reject(new Error("Не удалось загрузить изображение"))
      }

      img.src = event.target.result
    }

    reader.onerror = () => {
      reject(reader.error)
    }

    reader.readAsDataURL(file)
  })
}

/**
 * Показывает диалог выбора типа элемента для добавления
 * @param {string} parentId - ID родительской папки
 */
function showAddDialog(parentId) {
  // Получаем актуальный ID родительской папки из NavigationModule
  if (navigationModule) {
    const currentParentId = navigationModule.getCurrentParentId()
    log(
      `Показываем диалог добавления, родительская папка: ${currentParentId} (переданный parentId: ${parentId})`
    )

    // Используем актуальное значение вместо переданного
    parentId = currentParentId
  } else {
    log(
      `Показываем диалог добавления, родительская папка: ${parentId} (NavigationModule не доступен)`
    )
  }

  // Создаем модальное окно выбора типа
  const modal = new Modal()
  const content = document.createElement("div")
  content.className = "add-type-selector"

  // Добавляем кнопки для выбора типа
  ADD_BUTTONS_CONFIG.forEach((item) => {
    const button = document.createElement("button")
    button.className = "add-type-button"

    const icon = document.createElement("img")
    icon.src = document.body.classList.contains("dark-theme")
      ? item.iconDark
      : item.icon
    icon.alt = i18n.t(`BUTTONS.${item.action.toUpperCase()}`)

    const text = document.createElement("span")
    text.textContent = i18n.t(`BUTTONS.${item.action.toUpperCase()}`)

    button.appendChild(icon)
    button.appendChild(text)

    button.addEventListener("click", () => {
      modal.close()

      // Обрабатываем выбор типа
      if (item.action === "addFolder") {
        showCreateFolderDialog(parentId)
      } else if (item.action === "addBookmark") {
        showCreateBookmarkDialog(parentId)
      } else if (item.action === "addNote") {
        showCreateNoteDialog(parentId)
      }
    })

    content.appendChild(button)
  })

  // Показываем модальное окно
  modal.show(i18n.t("MODALS.ADD_ITEM"), "choice", null, null, null, content)
}

/**
 * Показывает диалог создания новой папки
 * @param {string} parentId - ID родительской папки
 */
function showCreateFolderDialog(parentId) {
  log("Показываем диалог создания папки в", parentId)

  // Обязательно перепроверяем ID родительской папки перед созданием
  // Это нужно делать до отображения модального окна, чтобы убедиться,
  // что используется текущий ID навигации
  let currentParentId = parentId
  if (navigationModule) {
    currentParentId = navigationModule.getCurrentParentId()
    if (currentParentId !== parentId) {
      log(`Обновлен ID родительской папки с ${parentId} на ${currentParentId}`)
    }
  }

  // Сохраняем финальный ID папки в переменной, чтобы использовать в замыкании
  const finalParentId = currentParentId
  log(`Финальный ID родительской папки для создания: ${finalParentId}`)

  const modal = new Modal()
  modal.show(
    i18n.t("MODALS.CREATE_FOLDER"),
    "folder",
    { title: "" },
    async (data) => {
      try {
        log("Данные формы для создания папки:", data)

        // Валидация данных
        if (!data || !data.title || data.title.trim() === "") {
          alert(i18n.t("VALIDATIONS.EMPTY_FOLDER_NAME"))
          return false
        }

        // Нормализуем данные
        const folderData = {
          title: data.title.trim(),
        }

        // Логируем детальную информацию для дебаггинга
        log(
          `Отправка запроса на создание папки: ${folderData.title} в родительской папке: ${finalParentId}`
        )

        // Создание папки с расширенной обработкой ошибок
        const result = await ErrorHandler.wrapAsync(
          createFolder(finalParentId, folderData.title),
          ErrorType.CREATE,
          "folder"
        )

        if (result) {
          log("Папка успешно создана:", result)
          modal.close()

          // Полностью очищаем кеш для обеспечения свежих данных
          window._folderContentsCache = {}
          window._cachedBookmarks = null

          // Добавляем задержку перед обновлением интерфейса
          setTimeout(() => {
            refreshCurrentView(true)
          }, 100)
          return true
        } else {
          logError("Не удалось создать папку: результат пустой или null")
          return false
        }
      } catch (error) {
        logError("Ошибка при создании папки:", error)
        return false
      }
    }
  )
}

/**
 * Показывает диалог создания новой закладки
 * @param {string} parentId - ID родительской папки
 */
function showCreateBookmarkDialog(parentId) {
  log("Показываем диалог создания закладки в", parentId)

  // Обязательно перепроверяем ID родительской папки перед созданием
  // Это нужно делать до отображения модального окна, чтобы убедиться,
  // что используется текущий ID навигации
  let currentParentId = parentId
  if (navigationModule) {
    currentParentId = navigationModule.getCurrentParentId()
    if (currentParentId !== parentId) {
      log(`Обновлен ID родительской папки с ${parentId} на ${currentParentId}`)
    }
  }

  // Сохраняем финальный ID папки в переменной, чтобы использовать в замыкании
  const finalParentId = currentParentId
  log(`Финальный ID родительской папки для создания: ${finalParentId}`)

  const modal = new Modal()
  modal.show(
    i18n.t("MODALS.CREATE_BOOKMARK"),
    "link",
    { title: "", url: "https://" },
    async (data) => {
      try {
        log("Данные формы для создания закладки:", data)

        // Валидация данных
        if (!data || !data.title || data.title.trim() === "") {
          alert(i18n.t("VALIDATIONS.EMPTY_BOOKMARK_NAME"))
          return false
        }

        // Нормализуем данные
        const bookmarkData = {
          title: data.title.trim(),
          url: data.url || "https://",
        }

        // Логируем детальную информацию для дебаггинга
        log(
          `Отправка запроса на создание закладки: ${bookmarkData.title} (${bookmarkData.url}) в родительской папке: ${finalParentId}`
        )

        // Создание закладки с расширенной обработкой ошибок
        const result = await ErrorHandler.wrapAsync(
          createBookmark(finalParentId, bookmarkData.title, bookmarkData.url),
          ErrorType.CREATE,
          "bookmark"
        )

        if (result) {
          log("Закладка успешно создана:", result)
          modal.close()

          // Полностью очищаем кеш для обеспечения свежих данных
          window._folderContentsCache = {}
          window._cachedBookmarks = null

          // Добавляем задержку перед обновлением интерфейса
          setTimeout(() => {
            refreshCurrentView(true)
          }, 100)
          return true
        } else {
          logError("Не удалось создать закладку: результат пустой или null")
          return false
        }
      } catch (error) {
        logError("Ошибка при создании закладки:", error)
        return false
      }
    }
  )
}

/**
 * Показывает диалог создания новой заметки
 * @param {string} parentId - ID родительской папки
 */
function showCreateNoteDialog(parentId) {
  log("Показываем диалог создания заметки в", parentId)

  // Обязательно перепроверяем ID родительской папки перед созданием
  let currentParentId = parentId
  if (navigationModule) {
    currentParentId = navigationModule.getCurrentParentId()
    if (currentParentId !== parentId) {
      log(`Обновлен ID родительской папки с ${parentId} на ${currentParentId}`)
    }
  }

  // Сохраняем финальный ID папки в переменной, чтобы использовать в замыкании
  const finalParentId = currentParentId
  log(`Финальный ID родительской папки для создания: ${finalParentId}`)

  // Создаем модальное окно для заметки
  const modal = new NoteModal()
  modal.show(
    i18n.t("MODALS.CREATE_NOTE"),
    { title: "", content: "" },
    async (data) => {
      try {
        log("Данные формы для создания заметки:", data)

        // Валидация данных
        if (!data || !data.title || data.title.trim() === "") {
          alert(i18n.t("VALIDATIONS.EMPTY_NOTE_TITLE"))
          return false
        }

        // Нормализуем данные
        const noteData = {
          title: data.title.trim(),
          content: data.content || "",
        }

        // Логируем детальную информацию для дебаггинга
        log(
          `Отправка запроса на создание заметки: ${noteData.title} в родительской папке: ${finalParentId}`
        )

        // Создание заметки с расширенной обработкой ошибок
        const result = await ErrorHandler.wrapAsync(
          createNote(finalParentId, noteData.title, noteData.content),
          ErrorType.CREATE,
          "note"
        )

        if (result) {
          log("Заметка успешно создана:", result)
          modal.close()

          // Полностью очищаем кеш для обеспечения свежих данных
          window._folderContentsCache = {}
          window._cachedBookmarks = null

          // Добавляем задержку перед обновлением интерфейса
          setTimeout(() => {
            refreshCurrentView(true)
          }, 100)
          return true
        } else {
          logError("Не удалось создать заметку: результат пустой или null")
          return false
        }
      } catch (error) {
        logError("Ошибка при создании заметки:", error)
        return false
      }
    }
  )
}

/**
 * Показывает диалог редактирования заметки
 * @param {Object} note - Объект заметки для редактирования
 */
function showNoteEditDialog(note) {
  log("Показываем диалог редактирования заметки:", note)

  try {
    // Создаем модальное окно для редактирования заметки
    const modal = new NoteModal()
    modal.show(
      i18n.t("MODALS.EDIT_NOTE"),
      {
        id: note.id,
        title: note.title,
        content: note.content || "",
        createdAt: note.createdAt,
      },
      async (data) => {
        try {
          log("Данные формы для обновления заметки:", data)

          // Валидация данных
          if (!data || !data.title || data.title.trim() === "") {
            alert(i18n.t("VALIDATIONS.EMPTY_NOTE_TITLE"))
            return false
          }

          // Обновляем заметку
          const result = await ErrorHandler.wrapAsync(
            updateNote(note.id, data),
            ErrorType.UPDATE,
            "note"
          )

          if (result) {
            log("Заметка успешно обновлена")
            modal.close()

            // Обновляем интерфейс
            refreshCurrentView(true)
            return true
          } else {
            logError("Не удалось обновить заметку:", result)
            return false
          }
        } catch (error) {
          logError("Ошибка при обновлении заметки:", error)
          return false
        }
      }
    )
  } catch (error) {
    logError("Ошибка при создании диалога редактирования заметки:", error)
  }
}

// Делаем функцию глобально доступной для компонентов
window.showNoteEditDialog = showNoteEditDialog

/**
 * Обрабатывает клик по элементу
 * @param {Event} e - Событие клика
 */
async function handleBookmarkItemClick(e) {
  console.log("handleBookmarkItemClick вызван", e)

  const bookmarkElement = e.target.closest(".bookmark-item")
  if (!bookmarkElement) {
    console.log("Элемент .bookmark-item не найден")
    return
  }

  console.log("bookmarkElement:", bookmarkElement)

  const isFolder = bookmarkElement.classList.contains("folder")
  const isNote = bookmarkElement.classList.contains("note")
  const id = bookmarkElement.dataset.id

  console.log("Тип элемента:", {
    id,
    isFolder,
    isNote,
    classes: bookmarkElement.className,
    type: bookmarkElement.dataset.type,
  })

  if (isFolder) {
    console.log("Обработка клика по папке")
    // Если это папка, переходим в неё
    if (navigationModule) {
      await navigationModule.handleFolderClick(bookmarkElement)
    }
  } else if (isNote) {
    console.log("Обработка клика по заметке")
    // Если это заметка, открываем её для просмотра/редактирования
    const title = bookmarkElement.querySelector(".bookmark-title").textContent
    const content = bookmarkElement.dataset.content || ""
    const createdAt = bookmarkElement.dataset.createdAt
      ? parseInt(bookmarkElement.dataset.createdAt)
      : null

    console.log("Данные заметки для редактирования:", {
      id,
      title,
      content,
      createdAt,
    })

    showNoteEditDialog({
      id,
      title,
      content,
      createdAt,
    })
  } else {
    console.log("Обработка клика по закладке")
    // Если это закладка, открываем URL
    const url = bookmarkElement.dataset.url
    if (url) {
      chrome.tabs.create({ url })
    }
  }
}

/**
 * Создает элемент закладки или папки для отображения
 * @param {Object} item - Данные закладки или папки
 * @param {Object} cachedIcons - Кеш иконок
 * @returns {HTMLElement} - DOM элемент
 */
function createBookmarkElement(item, cachedIcons = {}) {
  const bookmarkElement = document.createElement("div")
  bookmarkElement.className = `bookmark-item ${
    item.type === "folder" ? "folder" : item.type === "note" ? "note" : ""
  }`
  bookmarkElement.dataset.id = item.id
  bookmarkElement.dataset.type = item.type

  // Добавляем дополнительные данные в зависимости от типа
  if (item.type === "bookmark" && item.url) {
    bookmarkElement.dataset.url = item.url
  } else if (item.type === "note") {
    bookmarkElement.dataset.content = item.content || ""
    if (item.createdAt) {
      bookmarkElement.dataset.createdAt = item.createdAt
    }
  }

  // Делаем элемент перетаскиваемым
  bookmarkElement.setAttribute("draggable", "true")

  // Создаем иконку
  const icon = document.createElement("img")
  icon.className = "bookmark-icon"
  icon.alt = item.type

  if (item.type === "folder") {
    // Для папки используем иконку из кеша или дефолтную
    const cachedIcon = cachedIcons[item.id]
    if (cachedIcon) {
      icon.src = cachedIcon
    } else {
      icon.src = document.body.classList.contains("dark-theme")
        ? ICONS.FOLDER.DARK
        : ICONS.FOLDER.LIGHT
    }
  } else if (item.type === "note") {
    // Для заметки используем иконку заметки
    icon.src = document.body.classList.contains("dark-theme")
      ? ICONS.NOTE.DARK
      : ICONS.NOTE.LIGHT
  } else {
    // Для закладки используем стандартную иконку
    icon.src = ICONS.LINK
  }

  // Создаем заголовок
  const title = document.createElement("span")
  title.className = "bookmark-title"
  title.textContent = item.title

  // Добавляем элементы в закладку
  bookmarkElement.appendChild(icon)
  bookmarkElement.appendChild(title)

  // Добавляем обработчик клика
  bookmarkElement.addEventListener("click", handleBookmarkItemClick)

  return bookmarkElement
}
