/**
 * Модуль для управления пользовательским интерфейсом
 */
import { MainInterface } from "../components/MainInterface.js"
import { NestedMenu } from "../components/NestedMenu.js"
import { Modal } from "../components/Modal.js"
import { i18n } from "../utils/i18n.js"
import { log, logError } from "../utils/logging.js"
import { CSS_CLASSES, DOM_IDS } from "../config/constants.js"

export class UIModule {
  /**
   * Конструктор модуля UI
   * @param {HTMLElement} container - DOM-элемент контейнера, в котором отображаются закладки
   * @param {Array} bookmarks - Массив закладок для отображения
   */
  constructor(container, bookmarks) {
    this.container = container
    this.bookmarks = bookmarks
    this.currentView = null // MainInterface или NestedMenu
    this.navigationModule = null // Будет установлен после инициализации NavigationModule
  }

  /**
   * Отображает закладки
   * @param {Array} bookmarks - Массив закладок для отображения
   * @param {string} folderId - ID папки, для которой отображаются закладки
   * @param {string} folderTitle - Заголовок папки
   * @returns {Promise<void>}
   */
  async render(bookmarks, folderId, folderTitle) {
    try {
      // Сохраняем текущие данные
      this.bookmarks = bookmarks

      // Очищаем контейнер
      this.container.innerHTML = ""

      // Определяем, отображаем ли мы корневой уровень или вложенную папку
      const isRoot = folderId === "0"

      // Уничтожаем предыдущее представление, если оно есть
      if (this.currentView) {
        if (typeof this.currentView.destroy === "function") {
          this.currentView.destroy()
        }
        this.currentView = null
      }

      if (isRoot) {
        // Отображаем главный интерфейс (список всех закладок)
        this.currentView = new MainInterface(this.container, bookmarks)
        await this.currentView.render()

        // Устанавливаем классы для корневого уровня
        this.container.classList.remove("nested-view")

        // Обновляем заголовок и кнопку назад
        if (this.navigationModule) {
          this.navigationModule.updateFolderTitle("")
          this.navigationModule.toggleBackButton(false)
        }
      } else {
        // Отображаем вложенное меню (содержимое папки)
        this.currentView = new NestedMenu(this.container, bookmarks)
        await this.currentView.render()

        // Устанавливаем классы для вложенного уровня
        this.container.classList.add("nested-view")

        // Обновляем заголовок и кнопку назад
        if (this.navigationModule) {
          this.navigationModule.updateFolderTitle(folderTitle)
          this.navigationModule.toggleBackButton(true)
        }
      }

      // Обновляем data-атрибут для текущей папки
      this.container.dataset.folderId = folderId

      // Если элементов нет, показываем сообщение
      if (!bookmarks || bookmarks.length === 0) {
        this.showEmptyMessage(isRoot)
      }

      // Инициализируем интерактивность для новых элементов
      this.initializeInteractivity()

      return this.currentView
    } catch (error) {
      logError("Ошибка при отображении закладок:", error)
      this.showErrorMessage(i18n.t("ERROR.RENDER_FAILED"))
      return null
    }
  }

  /**
   * Показывает сообщение о пустой папке
   * @param {boolean} isRoot - Признак корневого уровня
   */
  showEmptyMessage(isRoot) {
    const emptyMessage = document.createElement("div")
    emptyMessage.className = "empty-message"
    emptyMessage.textContent = isRoot
      ? i18n.t("MESSAGES.NO_BOOKMARKS")
      : i18n.t("MESSAGES.EMPTY_FOLDER")

    this.container.appendChild(emptyMessage)
  }

  /**
   * Инициализирует интерактивность для элементов
   */
  initializeInteractivity() {
    // Добавление обработчиков событий для элементов
    // Будет дополнено по мере необходимости
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
   * Показывает сообщение об ошибке
   * @param {string} message - Текст сообщения
   */
  showErrorMessage(message) {
    alert(message)
  }

  /**
   * Показывает временное уведомление
   * @param {string} message - Текст сообщения
   * @param {number} duration - Длительность отображения в миллисекундах
   */
  showNotification(message, duration = 2000) {
    let notification = document.querySelector(".notification")

    if (!notification) {
      notification = document.createElement("div")
      notification.className = "notification"
      document.body.appendChild(notification)
    }

    notification.textContent = message
    notification.style.opacity = "1"

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
   * Показывает диалоговое окно добавления элемента
   * @param {string} parentId - ID родительской папки
   * @param {Function} onItemAdded - Колбек, выполняемый после добавления элемента
   */
  showAddDialog(parentId, onItemAdded) {
    // Реализация диалога добавления - будет дополнена по мере необходимости
  }
}
