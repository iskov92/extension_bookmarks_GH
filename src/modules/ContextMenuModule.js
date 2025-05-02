/**
 * Модуль для управления контекстным меню
 */
import { log, logError } from "../utils/logging.js"
import { ContextMenu } from "../components/ContextMenu.js"
import { Modal } from "../components/Modal.js"
import { i18n } from "../utils/i18n.js"
import { ErrorHandler, ErrorType } from "../utils/errorHandler.js"
import {
  updateBookmark,
  deleteBookmark,
  copyBookmark,
  updateFolder,
  getBookmarksInFolder,
} from "../utils/bookmarks.js"
import { trashStorage } from "../services/TrashStorage.js"
import { CONTEXT_MENU_CONFIG } from "../config/constants.js"

export class ContextMenuModule {
  /**
   * Конструктор модуля контекстного меню
   * @param {UIModule} uiModule - Модуль пользовательского интерфейса
   * @param {NavigationModule} navigationModule - Модуль навигации
   */
  constructor(uiModule, navigationModule) {
    this.uiModule = uiModule
    this.navigationModule = navigationModule

    // Инициализируем компонент контекстного меню
    this.contextMenu = new ContextMenu()

    // Настраиваем обработчики событий
    this.setupEventListeners()
  }

  /**
   * Настраивает обработчики событий
   */
  setupEventListeners() {
    // Устанавливаем обработчик правого клика на контейнере
    const container = this.uiModule.container
    container.addEventListener("contextmenu", this.handleContextMenu.bind(this))
  }

  /**
   * Обрабатывает событие открытия контекстного меню
   * @param {MouseEvent} e - Событие клика правой кнопкой мыши
   */
  async handleContextMenu(e) {
    e.preventDefault()

    // Находим элемент закладки или папки, на котором был сделан клик
    const bookmarkElement = e.target.closest(".bookmark-item")

    // Если клик был не на закладке, закрываем меню
    if (!bookmarkElement) {
      this.contextMenu.close()
      return
    }

    // Получаем данные о элементе
    const isFolder = bookmarkElement.classList.contains("folder")
    const id = bookmarkElement.dataset.id
    const title = bookmarkElement.querySelector(".bookmark-title").textContent
    const url = bookmarkElement.dataset.url

    // Определяем набор пунктов меню в зависимости от типа элемента
    const items = isFolder
      ? CONTEXT_MENU_CONFIG.FOLDER
      : CONTEXT_MENU_CONFIG.BOOKMARK

    // Показываем контекстное меню
    this.contextMenu.show(
      e.pageX,
      e.pageY,
      items,
      bookmarkElement,
      async (action) => {
        await this._handleMenuAction(
          action,
          bookmarkElement,
          id,
          isFolder,
          title,
          url
        )
      }
    )
  }

  /**
   * Обрабатывает выбор пункта в контекстном меню
   * @param {string} action - Выбранное действие
   * @param {HTMLElement} element - Элемент, для которого открыто меню
   * @param {string} id - ID закладки или папки
   * @param {boolean} isFolder - Признак папки
   * @param {string} title - Заголовок элемента
   * @param {string} url - URL закладки (если не папка)
   */
  async _handleMenuAction(action, element, id, isFolder, title, url) {
    switch (action) {
      case "rename":
      case "edit":
        if (isFolder) {
          this._showFolderEditDialog(element, id, title)
        } else {
          this._showBookmarkEditDialog(element, id, title, url)
        }
        break

      case "delete":
        await this._handleDeleteAction(id, isFolder, title, url)
        break

      case "copy":
        await this._handleCopyAction(id, isFolder)
        break

      default:
        logError("Неизвестное действие контекстного меню:", action)
    }
  }

  /**
   * Показывает диалог редактирования закладки
   * @param {HTMLElement} element - Элемент закладки
   * @param {string} id - ID закладки
   * @param {string} title - Заголовок закладки
   * @param {string} url - URL закладки
   */
  _showBookmarkEditDialog(element, id, title, url) {
    log("Редактирование закладки:", id, title, url)

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
            window.dispatchEvent(
              new CustomEvent("refresh-view", { detail: { force: true } })
            )
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

  /**
   * Показывает диалог редактирования папки
   * @param {HTMLElement} element - Элемент папки
   * @param {string} id - ID папки
   * @param {string} title - Заголовок папки
   */
  _showFolderEditDialog(element, id, title) {
    log("Редактирование папки:", id, title)

    const modal = new Modal()
    modal.show(
      i18n.t("MODALS.EDIT_FOLDER"),
      "folder",
      { title },
      async (data) => {
        try {
          log("Обработчик сохранения с данными:", data)

          // Обновляем папку
          const result = await ErrorHandler.wrapAsync(
            updateFolder(id, data),
            ErrorType.UPDATE,
            "folder"
          )

          if (result) {
            modal.close()

            // Обновляем интерфейс
            window.dispatchEvent(
              new CustomEvent("refresh-view", { detail: { force: true } })
            )
            return true
          } else {
            logError("Не удалось обновить папку", result)
            return false
          }
        } catch (error) {
          logError("Ошибка при обновлении папки:", error)
          return false
        }
      }
    )
  }

  /**
   * Обрабатывает действие удаления элемента
   * @param {string} id - ID закладки или папки
   * @param {boolean} isFolder - Признак папки
   * @param {string} title - Заголовок элемента
   * @param {string} url - URL закладки (если не папка)
   */
  async _handleDeleteAction(id, isFolder, title, url) {
    if (confirm(i18n.t("CONFIRM_DELETE"))) {
      try {
        // Создаем объект для сохранения в корзину
        let itemToTrash = {
          id,
          type: isFolder ? "folder" : "bookmark",
          title,
          url,
        }

        // Если это папка, получаем её содержимое рекурсивно
        if (isFolder) {
          const folderContents = await this._getFolderContentsRecursively(id)
          itemToTrash.contents = folderContents
        }

        // Сохраняем в корзину перед удалением
        await trashStorage.moveToTrash(
          itemToTrash,
          this.navigationModule.getNavigation().getStack()
        )

        // Удаляем из закладок
        const deleted = await ErrorHandler.wrapAsync(
          deleteBookmark(id),
          ErrorType.DELETE,
          isFolder ? "folder" : "bookmark"
        )

        if (deleted) {
          // Обновляем интерфейс
          window.dispatchEvent(
            new CustomEvent("refresh-view", { detail: { force: true } })
          )
        } else {
          this.uiModule.showErrorMessage(i18n.t("ERROR.DELETE_FAILED"))
        }
      } catch (error) {
        logError("Ошибка при удалении элемента:", error)
        ErrorHandler.handle(
          error,
          ErrorType.DELETE,
          isFolder ? "folder" : "bookmark"
        )
      }
    }
  }

  /**
   * Обрабатывает действие копирования элемента
   * @param {string} id - ID закладки или папки
   * @param {boolean} isFolder - Признак папки
   */
  async _handleCopyAction(id, isFolder) {
    try {
      // Закрываем контекстное меню
      this.contextMenu.close()

      // Получаем ID текущей папки
      const currentFolderId = this.navigationModule.getCurrentParentId()

      // Копируем закладку
      const result = await ErrorHandler.wrapAsync(
        copyBookmark(id, currentFolderId),
        ErrorType.COPY,
        isFolder ? "folder" : "bookmark"
      )

      if (result) {
        this.uiModule.showNotification(i18n.t("CONTEXT_MENU.COPY_SUCCESS"))

        // Обновляем интерфейс
        window.dispatchEvent(
          new CustomEvent("refresh-view", { detail: { force: true } })
        )
      }
    } catch (error) {
      logError("Ошибка при копировании элемента:", error)
    }
  }

  /**
   * Рекурсивно получает содержимое папки
   * @param {string} folderId - ID папки
   * @returns {Promise<Array>} - Массив элементов папки
   */
  async _getFolderContentsRecursively(folderId) {
    try {
      const contents = await ErrorHandler.wrapAsync(
        getBookmarksInFolder(folderId),
        ErrorType.READ,
        "folder"
      )

      if (!contents) return []

      for (const item of contents) {
        if (item.type === "folder") {
          item.contents = await this._getFolderContentsRecursively(item.id)
        }
      }

      return contents
    } catch (error) {
      logError("Ошибка при получении содержимого папки:", error)
      return []
    }
  }
}
