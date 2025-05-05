/**
 * Модуль для управления навигацией по папкам закладок
 */
import { Navigation } from "../utils/navigation.js"
import { getBookmarksInFolder, getAllBookmarks } from "../utils/bookmarks.js"
import { log, logError } from "../utils/logging.js"
import { ErrorHandler, ErrorType } from "../utils/errorHandler.js"
import { DOM_IDS, STORAGE_KEYS } from "../config/constants.js"
import { storage } from "../utils/storage.js"
import { i18n } from "../utils/i18n.js"

export class NavigationModule {
  /**
   * Конструктор модуля навигации
   * @param {HTMLElement} container - DOM-элемент контейнера, в котором отображаются закладки
   * @param {Function} updateUI - Функция для обновления интерфейса при изменении навигации
   */
  constructor(container, updateUI) {
    this.container = container
    this.updateUI = updateUI
    this.navigation = new Navigation()
    // Вместо задания parentId напрямую, используем метод getCurrentParentId
    this.currentParentId = this.navigation.getCurrentParentId()

    // Инициализируем DOM-элементы
    this.backButton = document.getElementById(DOM_IDS.BACK_BUTTON)
    this.currentFolder = document.getElementById(DOM_IDS.CURRENT_FOLDER)

    // Настраиваем обработчики событий
    this.setupEventListeners()
  }

  /**
   * Настраивает обработчики событий для навигации
   */
  setupEventListeners() {
    // Обработчик клика на кнопке "Назад"
    if (this.backButton) {
      this.backButton.addEventListener(
        "click",
        this.handleBackButtonClick.bind(this)
      )
    }

    // Обработчик клика на папке
    this.container.addEventListener(
      "click",
      this.handleContainerClick.bind(this)
    )
  }

  /**
   * Обрабатывает клик на контейнере и определяет, был ли клик по папке
   * @param {Event} e - Событие клика
   */
  async handleContainerClick(e) {
    const bookmarkElement = e.target.closest(".bookmark-item")
    if (!bookmarkElement) return

    const isFolder = bookmarkElement.classList.contains("folder")
    // Для заметок будет использоваться отдельный обработчик в popup.js
    if (isFolder) {
      await this.handleFolderClick(bookmarkElement)
    }
  }

  /**
   * Обрабатывает клик по папке и переходит в нее
   * @param {HTMLElement} bookmarkElement - Элемент папки, по которой кликнули
   */
  async handleFolderClick(bookmarkElement) {
    try {
      // Показываем индикатор загрузки
      this.showLoadingIndicator()

      const id = bookmarkElement.dataset.id
      const folderTitle =
        bookmarkElement.querySelector(".bookmark-title").textContent

      // Добавляем папку в стек навигации
      this.navigation.push({ id, title: folderTitle })
      this.currentParentId = id

      // Скрываем поиск при переходе в папку
      const searchModule = window.searchModule
      if (searchModule) {
        searchModule.toggleVisibility(false)
      }

      // Проверяем, был ли перемещен элемент в эту папку
      const hasRecentMove =
        window.lastMovedItem &&
        window.lastMovedItem.targetFolder === id &&
        Date.now() - window.lastMovedItem.timestamp < 30000 // 30 секунд

      // Получаем закладки для этой папки
      const folderContents = await ErrorHandler.wrapAsync(
        getBookmarksInFolder(id, hasRecentMove),
        ErrorType.NAVIGATION,
        "folder"
      )

      if (folderContents) {
        // Обновляем UI для отображения содержимого папки
        this.updateUI(folderContents, id, folderTitle)

        // Обновляем заголовок и показываем кнопку "Назад"
        this.updateFolderTitle(folderTitle)
        this.toggleBackButton(true)

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

        // Сохраняем текущее состояние навигации
        this.saveNavigationState()
      } else {
        // В случае ошибки откатываем состояние
        this.navigation.pop()
        this.currentParentId = this.navigation.getCurrentParentId()
      }
    } catch (error) {
      logError("Ошибка при переходе в папку:", error)
    } finally {
      // Скрываем индикатор загрузки
      this.hideLoadingIndicator()
    }
  }

  /**
   * Обрабатывает клик по кнопке "Назад"
   */
  async handleBackButtonClick() {
    try {
      // Показываем индикатор загрузки
      this.showLoadingIndicator()

      // Очищаем кеш для получения свежих данных
      window._folderContentsCache = {}
      window._cachedBookmarks = null

      // Проверяем, есть ли папки в стеке навигации
      if (this.navigation.getStack().length > 0) {
        // Удаляем текущую папку из стека
        this.navigation.pop()

        if (this.navigation.getStack().length > 0) {
          // Если стек не пуст, берем последнюю папку
          const previousFolder = this.navigation.currentFolder
          this.currentParentId = previousFolder.id

          // Обновляем UI
          this.updateFolderTitle(previousFolder.title)
          this.toggleBackButton(true)

          log(
            `Возвращаемся в папку ${previousFolder.id}: ${previousFolder.title}`
          )

          // Принудительно получаем содержимое папки без кеширования
          const folderContents = await ErrorHandler.wrapAsync(
            getBookmarksInFolder(previousFolder.id, true),
            ErrorType.NAVIGATION,
            "folder"
          )

          if (folderContents) {
            // Обновляем UI для отображения содержимого папки
            this.updateUI(
              folderContents,
              previousFolder.id,
              previousFolder.title
            )
          } else {
            // В случае ошибки возвращаемся в корень
            logError(
              "Не удалось получить содержимое папки, возвращаемся в корень"
            )
            this.navigation.clear()
            this.currentParentId = this.navigation.getCurrentParentId()
            this.updateFolderTitle("Закладки")
            this.toggleBackButton(false)

            // При возврате в корень отображаем поиск
            const searchModule = window.searchModule
            if (searchModule) {
              searchModule.toggleVisibility(true)
            }

            const rootBookmarks = await getAllBookmarks(true)
            this.updateUI(rootBookmarks, "0", "Закладки")
          }
        } else {
          // Вернулись в корневую папку
          this.currentParentId = this.navigation.getCurrentParentId()
          this.updateFolderTitle("Закладки")
          this.toggleBackButton(false)

          // При возврате в корень отображаем поиск
          const searchModule = window.searchModule
          if (searchModule) {
            searchModule.toggleVisibility(true)
          }

          log("Возвращаемся в корневую папку")

          // Получаем свежие закладки
          const rootBookmarks = await getAllBookmarks(true)
          this.updateUI(rootBookmarks, "0", "Закладки")
        }

        // Сохраняем текущее состояние навигации
        this.saveNavigationState()
      }
    } catch (error) {
      logError("Ошибка при обработке кнопки назад:", error)
    } finally {
      // Скрываем индикатор загрузки
      this.hideLoadingIndicator()
    }
  }

  /**
   * Обновляет заголовок текущей папки
   * @param {string} title - Заголовок папки
   */
  updateFolderTitle(title) {
    if (this.currentFolder) {
      this.currentFolder.textContent = title
      this.currentFolder.style.display = title ? "block" : "none"
    }
  }

  /**
   * Показывает или скрывает кнопку "Назад"
   * @param {boolean} show - Флаг отображения
   */
  toggleBackButton(show) {
    if (this.backButton) {
      this.backButton.style.display = show ? "block" : "none"
    }
  }

  /**
   * Показывает индикатор загрузки
   */
  showLoadingIndicator() {
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
  hideLoadingIndicator() {
    const loader = document.querySelector(".loader")
    if (loader) {
      loader.style.display = "none"
    }
  }

  /**
   * Сохраняет текущее состояние навигации в хранилище
   */
  saveNavigationState() {
    storage.set(STORAGE_KEYS.NAVIGATION, this.navigation.getStack())
  }

  /**
   * Устанавливает стек навигации из сохраненного состояния
   * @param {Array} stack - Массив объектов навигации
   */
  setStack(stack) {
    this.navigation.setStack(stack)

    // Проверяем, не пуст ли стек навигации
    if (stack && stack.length > 0) {
      this.currentParentId = this.navigation.currentFolder.id
    } else {
      // Если стек пуст, используем корневой ID
      this.currentParentId = "0"
    }
  }

  /**
   * Возвращает объект навигации
   * @returns {Navigation} - Объект навигации
   */
  getNavigation() {
    return this.navigation
  }

  /**
   * Возвращает текущий ID родительской папки
   * @returns {string} ID текущей родительской папки
   */
  getCurrentParentId() {
    // Проверяем, что навигация инициализирована и текущая папка существует
    if (!this.navigation) {
      console.error(
        "Навигация не инициализирована в NavigationModule.getCurrentParentId()"
      )
      return "0" // возвращаем корневую папку по умолчанию
    }

    // Используем встроенный метод Navigation для получения ID
    return this.navigation.getCurrentParentId()
  }
}
