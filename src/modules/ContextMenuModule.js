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
  updateFolder,
  deleteBookmark,
  copyBookmark,
  updateNote,
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

    // Закрываем предыдущее меню перед открытием нового
    this.contextMenu.close()

    // Находим элемент закладки или папки, на котором был сделан клик
    const bookmarkElement = e.target.closest(".bookmark-item")

    // Если клик был не на закладке, закрываем меню
    if (!bookmarkElement) {
      this.contextMenu.close()
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
          isNote,
          title,
          url,
          content,
          createdAt
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
   * @param {boolean} isNote - Признак заметки
   * @param {string} title - Заголовок элемента
   * @param {string} url - URL закладки (если не папка и не заметка)
   * @param {string} content - Содержимое заметки (если заметка)
   * @param {number} createdAt - Время создания заметки (если заметка)
   */
  async _handleMenuAction(
    action,
    element,
    id,
    isFolder,
    isNote,
    title,
    url,
    content,
    createdAt
  ) {
    switch (action) {
      case "rename":
      case "edit":
        if (isFolder) {
          this._showFolderEditDialog(element, id, title)
        } else if (isNote) {
          this._showNoteEditDialog(element, id, title, content, createdAt)
        } else {
          this._showBookmarkEditDialog(element, id, title, url)
        }
        break

      case "delete":
        await this._handleDeleteAction(
          id,
          isFolder,
          isNote,
          title,
          url,
          content,
          createdAt
        )
        break

      case "copy":
        await this._handleCopyAction(id, isFolder, isNote)
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
   * Показывает диалог редактирования заметки
   * @param {HTMLElement} element - Элемент заметки
   * @param {string} id - ID заметки
   * @param {string} title - Заголовок заметки
   * @param {string} content - Содержимое заметки
   * @param {number} createdAt - Время создания заметки
   */
  _showNoteEditDialog(element, id, title, content, createdAt) {
    try {
      // Импортируем компонент NoteModal
      import("../components/NoteModal.js").then(({ NoteModal }) => {
        const modal = new NoteModal()
        modal.show(
          i18n.t("MODALS.EDIT_NOTE"),
          {
            id,
            title,
            content: content || "",
            createdAt,
          },
          async (data) => {
            try {
              // Валидация данных
              if (!data || !data.title || data.title.trim() === "") {
                alert(i18n.t("VALIDATIONS.EMPTY_NOTE_TITLE"))
                return false
              }

              // Обновляем заметку
              const result = await ErrorHandler.wrapAsync(
                updateNote(id, data),
                ErrorType.UPDATE,
                "note"
              )

              if (result) {
                modal.close()

                // Обновляем интерфейс
                window.dispatchEvent(
                  new CustomEvent("refresh-view", { detail: { force: true } })
                )
                return true
              } else {
                this.uiModule.showErrorMessage(i18n.t("ERROR.UPDATE_FAILED"))
                return false
              }
            } catch (error) {
              logError("Ошибка при обновлении заметки:", error)
              return false
            }
          }
        )
      })
    } catch (error) {
      logError("Ошибка при создании диалога редактирования заметки:", error)
    }
  }

  /**
   * Обрабатывает действие удаления элемента
   * @param {string} id - ID закладки или папки
   * @param {boolean} isFolder - Признак папки
   * @param {boolean} isNote - Признак заметки
   * @param {string} title - Заголовок элемента
   * @param {string} url - URL закладки (если не папка)
   * @param {string} content - Содержимое заметки (если заметка)
   * @param {number} createdAt - Время создания заметки (если заметка)
   */
  async _handleDeleteAction(
    id,
    isFolder,
    isNote,
    title,
    url,
    content,
    createdAt
  ) {
    // Закрываем контекстное меню
    this.contextMenu.close()

    if (confirm(i18n.t("CONFIRM_DELETE"))) {
      try {
        // Создаем объект для сохранения в корзину
        let itemToTrash = {
          id,
          type: isFolder ? "folder" : isNote ? "note" : "bookmark",
          title,
          url,
        }

        // Добавляем поля для заметки
        if (isNote) {
          itemToTrash.content = content || ""
          if (createdAt) {
            itemToTrash.createdAt = createdAt
          }
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
          isFolder ? "folder" : isNote ? "note" : "bookmark"
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
          isFolder ? "folder" : isNote ? "note" : "bookmark"
        )
      }
    }
  }

  /**
   * Обрабатывает действие копирования элемента
   * @param {string} id - ID закладки или папки
   * @param {boolean} isFolder - Признак папки
   * @param {boolean} isNote - Признак заметки
   */
  async _handleCopyAction(id, isFolder, isNote) {
    try {
      // Закрываем контекстное меню
      this.contextMenu.close()

      // Получаем ID текущей папки
      const currentFolderId = this.navigationModule.getCurrentParentId()

      // Копируем элемент
      const result = await ErrorHandler.wrapAsync(
        copyBookmark(id, currentFolderId),
        ErrorType.COPY,
        isFolder ? "folder" : isNote ? "note" : "bookmark"
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
