/**
 * Модуль для управления перетаскиванием элементов (drag-and-drop)
 */
import { moveBookmark, reorderBookmarks } from "../utils/bookmarks.js"
import { ErrorHandler, ErrorType } from "../utils/errorHandler.js"
import { log, logError, logWarn } from "../utils/logging.js"
import { i18n } from "../utils/i18n.js"

export class DragDropModule {
  /**
   * Конструктор модуля DragDrop
   * @param {HTMLElement} container - DOM-элемент контейнера, в котором происходит перетаскивание
   * @param {UIModule} uiModule - Модуль UI
   * @param {NavigationModule} navigationModule - Модуль навигации
   */
  constructor(container, uiModule, navigationModule) {
    this.container = container
    this.uiModule = uiModule
    this.navigationModule = navigationModule

    // Переменные для отслеживания перетаскивания
    this.draggedElement = null
    this.draggedElementId = null
    this.draggedElementType = null
    this.folderHoverStartTime = null
    this.lastHoveredFolder = null
    this.tooltipElement = null

    // Флаги для управления процессом перетаскивания
    window.isDragging = false
    window.preventRefreshAfterDrop = false

    // Инициализируем перетаскивание
    this.initDragAndDrop()
    this.setupBackButtonDropTarget()
  }

  /**
   * Инициализирует функциональность перетаскивания
   */
  initDragAndDrop() {
    // Добавляем обработчики событий для перетаскивания
    this.container.addEventListener(
      "dragstart",
      this.handleDragStart.bind(this)
    )
    this.container.addEventListener("dragend", this.handleDragEnd.bind(this))
    this.container.addEventListener("dragover", this.handleDragOver.bind(this))
    this.container.addEventListener(
      "dragenter",
      this.handleDragEnter.bind(this)
    )
    this.container.addEventListener(
      "dragleave",
      this.handleDragLeave.bind(this)
    )
    this.container.addEventListener("drop", this.handleDrop.bind(this))

    // Добавляем обработчик для нажатий клавиш
    document.addEventListener("keydown", this.handleKeyDown.bind(this))

    // Устанавливаем атрибуты для перетаскивания
    this.container.setAttribute("data-drag-container", "true")

    log("Инициализация drag-and-drop завершена")
  }

  /**
   * Обрабатывает начало перетаскивания
   * @param {DragEvent} e - Событие начала перетаскивания
   */
  handleDragStart(e) {
    const target = e.target.closest(".bookmark-item")
    if (!target) return

    // Сохраняем информацию о перетаскиваемом элементе
    this.draggedElement = target
    this.draggedElementId = target.dataset.id
    this.draggedElementType = target.classList.contains("folder")
      ? "folder"
      : "bookmark"

    // Устанавливаем данные для перетаскивания
    e.dataTransfer.setData("text/plain", this.draggedElementId)
    e.dataTransfer.effectAllowed = "move"

    // Добавляем класс для стилизации
    target.classList.add("dragging")
    document.body.classList.add("dragging")

    // Устанавливаем флаг активного перетаскивания
    window.isDragging = true

    // Показываем подсказку о перетаскивании
    const isFolder = target.classList.contains("folder")
    if (isFolder) {
      this.showDraggingTooltip(i18n.t("DRAG_DROP.FOLDER_TIP"))
    } else {
      this.showDraggingTooltip(i18n.t("DRAG_DROP.ITEM_TIP"))
    }

    log(
      `Начало перетаскивания элемента ${this.draggedElementId} (${this.draggedElementType})`
    )
  }

  /**
   * Обрабатывает завершение перетаскивания
   * @param {DragEvent} e - Событие завершения перетаскивания
   */
  handleDragEnd(e) {
    // Сбрасываем стили
    if (this.draggedElement) {
      this.draggedElement.classList.remove("dragging")
    }
    document.body.classList.remove("dragging")

    // Сбрасываем время начала наведения на папку
    this.folderHoverStartTime = null

    // Сбрасываем выделение последней папки
    if (this.lastHoveredFolder) {
      this.lastHoveredFolder.classList.remove("highlight")
      this.lastHoveredFolder.style.transform = ""
      this.lastHoveredFolder.removeAttribute("data-hover-text")
      this.lastHoveredFolder = null
    }

    // Скрываем подсказку
    this.hideDraggingTooltip()

    // Сбрасываем флаг активного перетаскивания с небольшой задержкой
    setTimeout(() => {
      window.isDragging = false

      // Сбрасываем информацию о перетаскиваемом элементе
      this.draggedElement = null
      this.draggedElementId = null
      this.draggedElementType = null

      // Сбрасываем флаг блокировки обновления
      setTimeout(() => {
        window.preventRefreshAfterDrop = false
      }, 100)
    }, 50)

    log("Завершение перетаскивания")
  }

  /**
   * Обрабатывает перемещение над целевым элементом
   * @param {DragEvent} e - Событие перемещения
   */
  handleDragOver(e) {
    if (!this.draggedElementId) return

    e.preventDefault()
    e.dataTransfer.dropEffect = "move"

    // Получаем элемент, над которым находится курсор
    const target = e.target.closest(".bookmark-item")

    // Если перетаскиваем над самим собой или вне контейнера, игнорируем
    if (target === this.draggedElement) return

    // Если курсор не над конкретным элементом, проверяем, не над пустой ли областью
    if (!target) {
      // Очищаем все предыдущие эффекты наведения
      this.clearHoverEffects()

      const isOverEmptyArea =
        e.target === this.container ||
        e.target.classList.contains("empty-message") ||
        e.target.classList.contains("main-content") ||
        e.target.closest(".main-content") === this.container

      // Если над пустой областью и есть хотя бы один элемент - показываем индикатор для последнего
      if (isOverEmptyArea && this.container.children.length > 0) {
        const items = Array.from(
          this.container.querySelectorAll(".bookmark-item")
        )
        const lastItem = items[items.length - 1]

        if (lastItem && lastItem !== this.draggedElement) {
          lastItem.classList.add("drop-target")
          // Применяем стабильное смещение вместо динамического
          if (!lastItem.hasAttribute("data-shifted")) {
            lastItem.style.transform = "translateX(-15px)"
            lastItem.setAttribute("data-shifted", "true")
          }
          this.showDraggingTooltip(i18n.t("DRAG_DROP.AFTER_TIP"))
        }
      }
      return
    }

    // Если мы уже применили эффект к этому элементу, не меняем его снова при движении курсора внутри элемента
    // Это предотвращает дрожание эффекта
    if (
      (target.classList.contains("drop-target") &&
        target.hasAttribute("data-shifted")) ||
      (target.classList.contains("drop-target-above") &&
        target.hasAttribute("data-shifted")) ||
      (target.classList.contains("highlight") &&
        target === this.lastHoveredFolder)
    ) {
      return
    }

    // Очищаем предыдущие эффекты наведения, только если меняем целевой элемент
    this.clearHoverEffects()

    // Определяем положение курсора относительно элемента
    const targetRect = target.getBoundingClientRect()
    const mouseX = e.clientX
    const relativeX = ((mouseX - targetRect.left) / targetRect.width) * 100

    // Если навели на папку
    if (target.classList.contains("folder")) {
      if (relativeX <= 20) {
        // Левые 20% - вставить перед папкой
        target.classList.add("drop-target-above")
        target.style.transform = "translateX(15px)"
        target.setAttribute("data-shifted", "true")
        this.showDraggingTooltip(i18n.t("DRAG_DROP.BEFORE_TIP"))
      } else if (relativeX >= 80) {
        // Правые 20% - вставить после папки
        target.classList.add("drop-target")
        target.style.transform = "translateX(-15px)"
        target.setAttribute("data-shifted", "true")
        this.showDraggingTooltip(i18n.t("DRAG_DROP.AFTER_TIP"))
      } else {
        // Центральные 60% - вставить внутрь папки
        target.classList.add("highlight")
        this.lastHoveredFolder = target
        // Применяем эффект масштабирования, который более стабилен
        target.style.transform = "scale(1.02)"
        target.setAttribute("data-shifted", "true")
        this.showDraggingTooltip(i18n.t("DRAG_DROP.INTO_TIP"))
        target.setAttribute("data-hover-text", i18n.t("DRAG_DROP.FOLDER_HOVER"))

        // Удаляем логику автоматического открытия папки по таймеру
        // Оставляем только отслеживание времени начала наведения для возможного
        // использования в будущем (например, для визуальных эффектов)
        if (!this.folderHoverStartTime) {
          this.folderHoverStartTime = Date.now()
        }
      }
    } else {
      // Если навели на обычную закладку
      if (relativeX <= 20) {
        // Левые 20% - вставить перед
        target.classList.add("drop-target-above")
        target.style.transform = "translateX(15px)"
        target.setAttribute("data-shifted", "true")
        this.showDraggingTooltip(i18n.t("DRAG_DROP.BEFORE_TIP"))
      } else if (relativeX >= 80) {
        // Правые 20% - вставить после
        target.classList.add("drop-target")
        target.style.transform = "translateX(-15px)"
        target.setAttribute("data-shifted", "true")
        this.showDraggingTooltip(i18n.t("DRAG_DROP.AFTER_TIP"))
      } else {
        // Средняя часть - определяем по вертикали
        const mouseY = e.clientY
        const threshold = targetRect.top + targetRect.height / 2

        if (mouseY < threshold) {
          // Вставить перед
          target.classList.add("drop-target-above")
          target.style.transform = "translateX(15px)"
          target.setAttribute("data-shifted", "true")
          this.showDraggingTooltip(i18n.t("DRAG_DROP.BEFORE_TIP"))
        } else {
          // Вставить после
          target.classList.add("drop-target")
          target.style.transform = "translateX(-15px)"
          target.setAttribute("data-shifted", "true")
          this.showDraggingTooltip(i18n.t("DRAG_DROP.AFTER_TIP"))
        }
      }
    }
  }

  /**
   * Обрабатывает вход курсора в элемент при перетаскивании
   * @param {DragEvent} e - Событие входа в элемент
   */
  handleDragEnter(e) {
    if (!this.draggedElementId) return

    // Предотвращаем стандартное поведение
    e.preventDefault()

    const target = e.target.closest(".bookmark-item")
    if (!target || target === this.draggedElement) return

    // Если это папка, и мы только начали наведение
    if (
      target.classList.contains("folder") &&
      (!this.lastHoveredFolder || this.lastHoveredFolder !== target)
    ) {
      // Запоминаем время начала наведения
      this.folderHoverStartTime = Date.now()
    }
  }

  /**
   * Обрабатывает выход из целевого элемента
   * @param {DragEvent} e - Событие выхода
   */
  handleDragLeave(e) {
    const target = e.target.closest(".bookmark-item")
    if (!target) return

    // Удаляем индикаторы перетаскивания и сбрасываем трансформацию
    target.classList.remove("drop-target")
    target.classList.remove("drop-target-above")
    target.style.transform = "" // Сбрасываем смещение

    // Удаляем атрибут подсказки
    target.removeAttribute("data-hover-text")

    // Если это папка, удаляем выделение
    if (
      target.classList.contains("folder") &&
      target === this.lastHoveredFolder
    ) {
      target.classList.remove("highlight")
      this.lastHoveredFolder = null

      // Сбрасываем время начала наведения на папку
      this.folderHoverStartTime = null

      // Удаляем атрибут смещения
      target.removeAttribute("data-shifted")
    }
  }

  /**
   * Обрабатывает сброс перетаскиваемого элемента
   * @param {DragEvent} e - Событие сброса
   */
  async handleDrop(e) {
    e.preventDefault()

    // Если нет активного перетаскивания, выходим
    if (!window.isDragging || !this.draggedElementId) return

    log(`Обработка сброса элемента ${this.draggedElementId}`)

    // Устанавливаем флаг для предотвращения автоматического обновления
    window.preventRefreshAfterDrop = true

    try {
      // Получаем целевой элемент
      let target = e.target.closest(".bookmark-item")
      const currentFolderId = this.navigationModule.getCurrentParentId()

      // Если сброс вне элементов (в пустую область)
      if (!target) {
        const isOverEmptyArea =
          e.target === this.container ||
          e.target.classList.contains("empty-message") ||
          e.target.classList.contains("main-content") ||
          e.target.closest(".main-content") === this.container

        if (isOverEmptyArea) {
          log(`Перемещение в конец списка в папке ${currentFolderId}`)
          await this.moveToEndOfList(currentFolderId)
          this.clearHoverEffects()
          return
        }

        // Если не над пустой областью и не над элементом, просто выходим
        this.clearHoverEffects()
        return
      }

      // Если пытаемся перетащить на самого себя
      if (target === this.draggedElement) {
        this.clearHoverEffects()
        return
      }

      // Определяем действие в зависимости от состояния целевого элемента
      if (
        target.classList.contains("highlight") &&
        target.classList.contains("folder")
      ) {
        // Перемещение внутрь папки (центр папки)
        const targetFolderId = target.dataset.id

        // Проверка, чтобы не перемещать папку в саму себя
        if (this.draggedElementId === targetFolderId) {
          logWarn("Нельзя переместить папку в саму себя")
          this.uiModule.showNotification(
            i18n.t("DRAG_DROP.FOLDER_SELF_ERROR"),
            "error"
          )
          this.clearHoverEffects()
          return
        }

        await this.moveIntoFolder(targetFolderId)
      } else if (target.classList.contains("drop-target-above")) {
        // Перемещение перед целевым элементом
        log(
          `Перемещение элемента ${this.draggedElementId} перед ${target.dataset.id}`
        )
        await this.reorderBeforeTarget(target.dataset.id, currentFolderId)
      } else if (target.classList.contains("drop-target")) {
        // Перемещение после целевого элемента
        const allItems = Array.from(
          this.container.querySelectorAll(".bookmark-item")
        )
        const targetIndex = allItems.indexOf(target)

        if (targetIndex !== -1 && targetIndex < allItems.length - 1) {
          // Есть следующий элемент - вставляем перед ним
          const nextElement = allItems[targetIndex + 1]
          log(
            `Перемещение элемента ${this.draggedElementId} после ${target.dataset.id} (перед ${nextElement.dataset.id})`
          )
          await this.reorderBeforeTarget(
            nextElement.dataset.id,
            currentFolderId
          )
        } else {
          // Последний элемент - вставляем в конец
          log(
            `Перемещение элемента ${this.draggedElementId} в конец списка (после ${target.dataset.id})`
          )
          await this.moveToEndOfList(currentFolderId)
        }
      } else {
        // Если нет явных классов (например, при быстром перемещении)
        // Определяем положение относительно центра элемента
        const targetRect = target.getBoundingClientRect()
        const mouseY = e.clientY
        const threshold = targetRect.top + targetRect.height / 2

        if (mouseY < threshold) {
          // Курсор выше середины - вставить перед
          log(
            `Перемещение элемента ${this.draggedElementId} перед ${target.dataset.id} (по позиции мыши)`
          )
          await this.reorderBeforeTarget(target.dataset.id, currentFolderId)
        } else {
          // Курсор ниже середины - вставить после
          const allItems = Array.from(
            this.container.querySelectorAll(".bookmark-item")
          )
          const targetIndex = allItems.indexOf(target)

          if (targetIndex !== -1 && targetIndex < allItems.length - 1) {
            // Есть следующий элемент - вставляем перед ним
            const nextElement = allItems[targetIndex + 1]
            log(
              `Перемещение элемента ${this.draggedElementId} после ${target.dataset.id} (перед ${nextElement.dataset.id}, по позиции мыши)`
            )
            await this.reorderBeforeTarget(
              nextElement.dataset.id,
              currentFolderId
            )
          } else {
            // Последний элемент - вставляем в конец
            log(
              `Перемещение элемента ${this.draggedElementId} в конец списка (после ${target.dataset.id}, по позиции мыши)`
            )
            await this.moveToEndOfList(currentFolderId)
          }
        }
      }
    } catch (error) {
      logError("Ошибка при обработке события drop:", error)
      // Обновляем представление в случае ошибки
      window.dispatchEvent(
        new CustomEvent("refresh-view", { detail: { force: true } })
      )
    } finally {
      // Очищаем все эффекты
      this.clearHoverEffects()

      // Сбрасываем флаг блокировки обновления через некоторое время
      setTimeout(() => {
        window.preventRefreshAfterDrop = false
      }, 100)
    }
  }

  /**
   * Перемещает элемент перед указанным целевым элементом
   * @param {string} targetId - ID целевого элемента
   * @param {string} currentFolderId - ID текущей папки
   */
  async reorderBeforeTarget(targetId, currentFolderId) {
    try {
      // Визуально перемещаем элемент немедленно для лучшего UX
      if (this.draggedElement && this.draggedElement.parentNode) {
        const targetElement = Array.from(
          this.container.querySelectorAll(".bookmark-item")
        ).find((item) => item.dataset.id === targetId)

        if (targetElement) {
          const oldParent = this.draggedElement.parentNode
          const nextSibling = this.draggedElement.nextSibling

          // Удаляем элемент из текущей позиции
          oldParent.removeChild(this.draggedElement)

          // Вставляем перед целевым элементом
          targetElement.parentNode.insertBefore(
            this.draggedElement,
            targetElement
          )

          // Выполняем серверную операцию
          const result = await reorderBookmarks(
            this.draggedElementId,
            targetId,
            currentFolderId
          )

          if (result) {
            this.uiModule.showNotification(i18n.t("DRAG_DROP.REORDER_SUCCESS"))
          } else {
            // В случае ошибки возвращаем в исходную позицию
            logWarn("Ошибка переупорядочивания, возвращаем элемент на место")
            if (nextSibling) {
              oldParent.insertBefore(this.draggedElement, nextSibling)
            } else {
              oldParent.appendChild(this.draggedElement)
            }
          }
        }
      }
    } catch (error) {
      logError("Ошибка при переупорядочивании:", error)
      window.dispatchEvent(
        new CustomEvent("refresh-view", { detail: { force: true } })
      )
    }
  }

  /**
   * Перемещает элемент в конец списка
   * @param {string} currentFolderId - ID текущей папки
   */
  async moveToEndOfList(currentFolderId) {
    try {
      // Визуально перемещаем элемент немедленно
      if (this.draggedElement && this.draggedElement.parentNode) {
        const oldParent = this.draggedElement.parentNode
        const nextSibling = this.draggedElement.nextSibling

        // Удаляем элемент из текущей позиции
        oldParent.removeChild(this.draggedElement)

        // Добавляем в конец списка
        this.container.appendChild(this.draggedElement)

        // Выполняем серверную операцию (null означает в конец)
        const result = await reorderBookmarks(
          this.draggedElementId,
          null,
          currentFolderId
        )

        if (result) {
          this.uiModule.showNotification(i18n.t("DRAG_DROP.REORDER_SUCCESS"))
        } else {
          // В случае ошибки возвращаем в исходную позицию
          logWarn("Ошибка переупорядочивания в конец списка")
          if (nextSibling) {
            oldParent.insertBefore(this.draggedElement, nextSibling)
          } else {
            oldParent.appendChild(this.draggedElement)
          }
        }
      }
    } catch (error) {
      logError("Ошибка при перемещении в конец списка:", error)
      window.dispatchEvent(
        new CustomEvent("refresh-view", { detail: { force: true } })
      )
    }
  }

  /**
   * Перемещает элемент внутрь указанной папки
   * @param {string} targetFolderId - ID целевой папки
   */
  async moveIntoFolder(targetFolderId) {
    try {
      log(
        `Перемещение элемента ${this.draggedElementId} в папку ${targetFolderId}`
      )

      // Удаляем элемент из DOM сразу для лучшего отклика
      if (this.draggedElement && this.draggedElement.parentNode) {
        this.draggedElement.parentNode.removeChild(this.draggedElement)
      }

      const result = await moveBookmark(this.draggedElementId, targetFolderId)

      if (result) {
        this.uiModule.showNotification(i18n.t("DRAG_DROP.MOVE_SUCCESS"))

        // Обновляем представление
        window.dispatchEvent(
          new CustomEvent("refresh-view", { detail: { force: true } })
        )
      }
    } catch (error) {
      logError("Ошибка при перемещении в папку:", error)
      ErrorHandler.handle(error, ErrorType.MOVE, this.draggedElementType)
      window.dispatchEvent(
        new CustomEvent("refresh-view", { detail: { force: true } })
      )
    }
  }

  /**
   * Настраивает кнопку "Назад" как цель для перетаскивания
   */
  setupBackButtonDropTarget() {
    const backButton = document.getElementById("backButton")
    if (!backButton) return

    // Добавляем обработчики событий
    backButton.addEventListener(
      "dragover",
      this.handleBackButtonDragOver.bind(this)
    )
    backButton.addEventListener(
      "dragleave",
      this.handleBackButtonDragLeave.bind(this)
    )
    backButton.addEventListener("drop", this.handleBackButtonDrop.bind(this))
  }

  /**
   * Обрабатывает перемещение над кнопкой "Назад"
   * @param {DragEvent} e - Событие перемещения
   */
  handleBackButtonDragOver(e) {
    // Предотвращаем стандартное поведение и разрешаем drop
    e.preventDefault()
    e.stopPropagation()

    // Только если мы не в корне и идет перетаскивание
    if (
      !this.navigationModule.getNavigation().isRoot &&
      this.draggedElementId
    ) {
      e.target.classList.add("drag-over")
      e.dataTransfer.dropEffect = "move"
    }
  }

  /**
   * Обрабатывает выход из кнопки "Назад"
   * @param {DragEvent} e - Событие выхода
   */
  handleBackButtonDragLeave(e) {
    e.target.classList.remove("drag-over")
  }

  /**
   * Обрабатывает сброс на кнопку "Назад"
   * @param {DragEvent} e - Событие сброса
   */
  async handleBackButtonDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    e.target.classList.remove("drag-over")

    // Проверяем, что есть ID перетаскиваемого элемента и мы не в корне
    if (
      this.draggedElementId &&
      !this.navigationModule.getNavigation().isRoot
    ) {
      // Получаем родительскую папку текущей папки
      const stack = this.navigationModule.getNavigation().getStack()
      let parentFolderId = "0"

      // Если в стеке больше одного элемента, берем ID предыдущего
      if (stack.length > 1) {
        parentFolderId = stack[stack.length - 2].id
      }

      // Перемещаем элемент в родительскую папку
      try {
        const draggedItemId = this.draggedElementId
        const draggedElement = this.draggedElement

        // Сбрасываем переменные перетаскивания
        this.draggedElementId = null
        this.draggedElementType = null
        window.isDragging = false

        // Немедленно удаляем элемент из DOM, чтобы избежать дублирования
        if (draggedElement && draggedElement.parentNode) {
          draggedElement.parentNode.removeChild(draggedElement)
        }

        // Выполняем перемещение
        const result = await moveBookmark(draggedItemId, parentFolderId)

        if (result) {
          this.uiModule.showNotification(i18n.t("DRAG_DROP.MOVE_SUCCESS"))

          // Сохраняем информацию о перемещённом элементе
          window.lastMovedItem = {
            itemId: draggedItemId,
            targetFolder: parentFolderId,
            timestamp: Date.now(),
          }

          // Если перетаскиваемый элемент - это текущая папка, переходим назад
          if (
            draggedItemId ===
            this.navigationModule.getNavigation().currentFolder?.id
          ) {
            await this.navigationModule.handleBackButtonClick()
          } else {
            // Обновляем представление
            window.dispatchEvent(
              new CustomEvent("refresh-view", { detail: { force: true } })
            )
          }
        }
      } catch (error) {
        logError("Ошибка при перемещении элемента на уровень выше:", error)
        ErrorHandler.handle(
          error,
          ErrorType.MOVE,
          this.draggedElementType || "bookmark"
        )
      }
    }
  }

  /**
   * Очищает эффекты выделения и таймеры
   */
  clearHoverEffects() {
    // Сбрасываем время начала наведения на папку
    this.folderHoverStartTime = null

    // Сбрасываем выделение последней папки
    if (this.lastHoveredFolder) {
      this.lastHoveredFolder.classList.remove("highlight")
      this.lastHoveredFolder.style.transform = ""
      this.lastHoveredFolder.removeAttribute("data-hover-text")
      this.lastHoveredFolder.removeAttribute("data-shifted")
      this.lastHoveredFolder = null
    }

    // Очищаем все индикаторы перетаскивания и сбрасываем трансформации
    const dropTargets = this.container.querySelectorAll(
      ".drop-target, .drop-target-above, .highlight"
    )

    dropTargets.forEach((el) => {
      el.classList.remove("drop-target")
      el.classList.remove("drop-target-above")
      el.classList.remove("highlight")
      el.style.transform = "" // Сбрасываем смещение
      el.removeAttribute("data-hover-text")
      el.removeAttribute("data-shifted")
    })
  }

  /**
   * Показывает подсказку о перетаскивании
   * @param {string} text - Текст подсказки
   */
  showDraggingTooltip(text) {
    if (!this.tooltipElement) {
      this.tooltipElement = document.createElement("div")
      this.tooltipElement.className = "dragging-tooltip"
      document.body.appendChild(this.tooltipElement)
    }

    this.tooltipElement.textContent = text
    this.tooltipElement.classList.add("visible")

    // Автоматически скрываем через 3 секунды
    setTimeout(() => {
      this.hideDraggingTooltip()
    }, 3000)
  }

  /**
   * Скрывает подсказку о перетаскивании
   */
  hideDraggingTooltip() {
    if (this.tooltipElement) {
      this.tooltipElement.classList.remove("visible")
    }
  }

  /**
   * Обрабатывает нажатия клавиш во время перетаскивания
   * @param {KeyboardEvent} e - Событие нажатия клавиши
   */
  handleKeyDown(e) {
    // Реагируем на клавиши только если идет перетаскивание
    if (!window.isDragging) return

    // ESC - отменяет операцию перетаскивания
    if (e.key === "Escape") {
      this.cancelDragging()
    }
  }

  /**
   * Отменяет текущую операцию перетаскивания
   */
  cancelDragging() {
    log("Отмена операции перетаскивания")
    // Очищаем эффекты
    this.clearHoverEffects()

    // Сбрасываем состояние перетаскивания
    if (this.draggedElement) {
      this.draggedElement.classList.remove("dragging")
    }
    document.body.classList.remove("dragging")

    // Сбрасываем переменные
    this.draggedElement = null
    this.draggedElementId = null
    this.draggedElementType = null

    // Скрываем подсказку
    this.hideDraggingTooltip()

    // Сбрасываем флаг
    window.isDragging = false
  }

  /**
   * Освобождает ресурсы, удаляет обработчики событий
   */
  destroy() {
    // Удаляем обработчик клавиш
    document.removeEventListener("keydown", this.handleKeyDown)

    // Скрываем подсказку
    this.hideDraggingTooltip()

    // Удаляем tooltip если он существует
    if (this.tooltipElement && this.tooltipElement.parentNode) {
      this.tooltipElement.parentNode.removeChild(this.tooltipElement)
      this.tooltipElement = null
    }

    // Сбрасываем переменные
    this.draggedElement = null
    this.draggedElementId = null
    this.draggedElementType = null
    this.lastHoveredFolder = null

    log("DragDropModule уничтожен")
  }
}
