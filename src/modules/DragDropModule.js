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
    this.pendingDragElement = null

    // Переменные для оптимизации
    this.lastX = 0
    this.lastY = 0
    this.lastTarget = null
    this.debounceTimer = null

    // Переменные для отслеживания клика vs. перетаскивания
    this.mouseDownX = 0
    this.mouseDownY = 0
    this.mouseDownTimer = null
    this.dragThreshold = 5 // пикселей для определения перетаскивания
    this.dragDelay = 150 // мс перед определением перетаскивания

    // Флаги для управления процессом перетаскивания
    window.isDragging = false
    window.preventRefreshAfterDrop = false

    // Инициализируем перетаскивание
    this.initDragAndDrop()
    this.setupBackButtonDropTarget()
    this.setupDragZoneObserver()
  }

  /**
   * Настраивает наблюдатель DOM для добавления зон перетаскивания для новых элементов
   */
  setupDragZoneObserver() {
    // Настраиваем MutationObserver для отслеживания изменений в DOM
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          // Проверяем добавленные узлы
          mutation.addedNodes.forEach((node) => {
            // Если добавлен элемент с классом bookmark-item
            if (
              node.nodeType === 1 &&
              node.classList.contains("bookmark-item")
            ) {
              this.setupDragZonesForElement(node)
            }
          })
        }
      })
    })

    // Начинаем наблюдать за контейнером
    observer.observe(this.container, {
      childList: true,
      subtree: true,
    })

    // Также настраиваем зоны для всех существующих элементов
    this.setupDragZonesForAllElements()

    log("Наблюдатель зон перетаскивания инициализирован")
  }

  /**
   * Настраивает зоны перетаскивания для всех существующих элементов
   */
  setupDragZonesForAllElements() {
    // Получаем все элементы bookmark-item в контейнере
    const items = this.container.querySelectorAll(".bookmark-item")
    items.forEach((item) => {
      this.setupDragZonesForElement(item)
    })
  }

  /**
   * Настраивает зоны перетаскивания для отдельного элемента
   * @param {HTMLElement} element - Элемент, для которого нужно настроить зоны
   */
  setupDragZonesForElement(element) {
    // Определяем тип элемента (папка или закладка)
    const isFolder = element.classList.contains("folder")

    // Если это папка, добавляем центральную зону
    if (isFolder) {
      // Проверяем, нет ли уже центральной зоны
      if (!element.querySelector(".folder-center-zone")) {
        const centerZone = document.createElement("div")
        centerZone.className = "folder-center-zone"
        centerZone.setAttribute("data-zone", "inside")
        element.appendChild(centerZone)
      }
    }
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

    // Добавляем обработчики для изменения курсора
    this.container.addEventListener(
      "mousedown",
      this.handleMouseDown.bind(this)
    )
    document.addEventListener("mouseup", this.handleMouseUp.bind(this))

    // Добавляем обработчик для нажатий клавиш
    document.addEventListener("keydown", this.handleKeyDown.bind(this))

    // Устанавливаем атрибуты для перетаскивания
    this.container.setAttribute("data-drag-container", "true")

    log("Инициализация drag-and-drop завершена")
  }

  /**
   * Обрабатывает нажатие кнопки мыши
   * @param {MouseEvent} e - Событие нажатия мыши
   */
  handleMouseDown(e) {
    // Проверяем, что это левая кнопка мыши (0)
    if (e.button !== 0) return

    const target = e.target.closest(".bookmark-item")
    if (!target) return

    // Сохраняем позицию мыши для определения, было ли это перетаскивание или клик
    this.mouseDownX = e.clientX
    this.mouseDownY = e.clientY

    // Сохраняем целевой элемент для возможного перетаскивания
    this.pendingDragElement = target

    // Больше не добавляем класс сразу при mousedown
    // Вместо этого будем добавлять его только при фактическом начале перетаскивания

    // Добавляем глобальные обработчики для отслеживания движения мыши
    document.addEventListener("mousemove", this.handleMouseMoveGlobal)
  }

  /**
   * Глобальный обработчик движения мыши (будет добавлен только при mousedown)
   * @param {MouseEvent} e - Событие движения мыши
   */
  handleMouseMoveGlobal = (e) => {
    // Если нет активного pendingDragElement, выходим
    if (!this.pendingDragElement) return

    // Вычисляем смещение от начальной позиции
    const deltaX = Math.abs(e.clientX - this.mouseDownX)
    const deltaY = Math.abs(e.clientY - this.mouseDownY)

    // Если смещение больше порога и нажата кнопка мыши,
    // считаем это началом перетаскивания
    if (deltaX > this.dragThreshold || deltaY > this.dragThreshold) {
      // Добавляем класс для отслеживания активного перетаскивания,
      // но не меняем курсор
      document.body.classList.add("dragging-active")

      // Делаем элемент перетаскиваемым
      this.pendingDragElement.setAttribute("draggable", "true")

      // Очищаем таймер, так как решение уже принято
      if (this.mouseDownTimer) {
        clearTimeout(this.mouseDownTimer)
        this.mouseDownTimer = null
      }
    }
  }

  /**
   * Обрабатывает отпускание кнопки мыши
   * @param {MouseEvent} e - Событие отпускания мыши
   */
  handleMouseUp(e) {
    // Очищаем таймер, если он активен
    if (this.mouseDownTimer) {
      clearTimeout(this.mouseDownTimer)
      this.mouseDownTimer = null
    }

    // Удаляем класс активного перетаскивания
    document.body.classList.remove("dragging-active")

    // Если есть pending-элемент, делаем его не перетаскиваемым
    if (this.pendingDragElement) {
      this.pendingDragElement.removeAttribute("draggable")
      this.pendingDragElement = null
    }

    // Удаляем глобальный обработчик движения мыши
    document.removeEventListener("mousemove", this.handleMouseMoveGlobal)
  }

  /**
   * Обрабатывает начало перетаскивания
   * @param {DragEvent} e - Событие начала перетаскивания
   */
  handleDragStart(e) {
    const target = e.target.closest(".bookmark-item")
    if (!target) return

    // Очищаем все возможные эффекты перед началом перетаскивания
    this.clearHoverEffects()

    // Добавляем класс для изменения курсора при активном перетаскивании
    document.body.classList.add("dragging")

    // Сохраняем информацию о перетаскиваемом элементе
    this.draggedElement = target
    this.draggedElementId = target.dataset.id
    this.draggedElementType = target.classList.contains("folder")
      ? "folder"
      : "bookmark"

    // Устанавливаем данные для перетаскивания
    e.dataTransfer.setData("text/plain", this.draggedElementId)
    e.dataTransfer.effectAllowed = "move"

    // Проверка, является ли список пустым (только перетаскиваемый элемент)
    const items = Array.from(
      this.container.querySelectorAll(".bookmark-item")
    ).filter((item) => item !== this.draggedElement)

    if (items.length === 0) {
      this.container.classList.add("empty-during-drag")
    }

    // Устанавливаем немного прозрачности для лучшей видимости под курсором
    // Добавляем задержку для избежания мерцания
    setTimeout(() => {
      if (this.draggedElement) {
        this.draggedElement.classList.add("dragging")
        document.body.classList.remove("dragging-active")
      }
    }, 0)

    // Устанавливаем флаг активного перетаскивания
    window.isDragging = true

    log(
      `Начало перетаскивания элемента ${this.draggedElementId} (${this.draggedElementType})`
    )
  }

  /**
   * Обрабатывает завершение перетаскивания
   * @param {DragEvent} e - Событие завершения перетаскивания
   */
  handleDragEnd(e) {
    // Удаляем все классы, связанные с перетаскиванием
    document.body.classList.remove("dragging")
    document.body.classList.remove("dragging-active")

    if (this.draggedElement) {
      this.draggedElement.classList.remove("dragging")
      this.draggedElement.removeAttribute("draggable")
    }

    // Удаляем класс пустого списка при перетаскивании
    this.container.classList.remove("empty-during-drag")

    // Очищаем все эффекты наведения
    this.clearHoverEffects()

    // Сбрасываем время начала наведения на папку
    this.folderHoverStartTime = null

    // Сбрасываем выделение последней папки
    if (this.lastHoveredFolder) {
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

    // Оптимизация: проверяем, изменилось ли положение курсора достаточно для обновления
    // Это снижает количество обработок и предотвращает дрожание
    const x = e.clientX
    const y = e.clientY

    // Если курсор переместился менее чем на 2 пикселя, игнорируем событие
    if (Math.abs(x - this.lastX) < 2 && Math.abs(y - this.lastY) < 2) {
      return
    }

    // Сохраняем текущие координаты
    this.lastX = x
    this.lastY = y

    // Получаем элемент, над которым находится курсор
    const target = e.target.closest(".bookmark-item")

    // Если перетаскиваем над самим собой или вне контейнера, игнорируем
    if (target === this.draggedElement) return

    // Если курсор не над конкретным элементом, проверяем, не над пустой ли областью
    if (!target) {
      // Очищаем все предыдущие эффекты наведения
      this.clearHoverEffects()

      // Проверяем, находится ли курсор над пустой областью контейнера
      // Если да, то перестаем показывать индикатор последнего элемента
      // Это исправляет проблему с предложением перемещения в конец списка при наведении на пустое место
      const isOverEmptyArea =
        e.target === this.container ||
        e.target.classList.contains("empty-message") ||
        e.target.classList.contains("main-content") ||
        e.target.closest(".main-content") === this.container

      // Если над пустой областью и мы находимся не в пустом списке,
      // проверяем, находится ли курсор вблизи последнего элемента
      if (isOverEmptyArea && this.container.children.length > 0) {
        const items = Array.from(
          this.container.querySelectorAll(".bookmark-item")
        ).filter((item) => item !== this.draggedElement)

        // Если в списке нет элементов (кроме перетаскиваемого), выходим
        if (items.length === 0) return

        const lastItem = items[items.length - 1]

        // Получаем размеры и позицию последнего элемента
        const lastItemRect = lastItem.getBoundingClientRect()
        // Проверяем, находится ли курсор в пределах 30px по горизонтали от последнего элемента
        const isNearLastItem = Math.abs(x - (lastItemRect.right + 15)) < 30

        if (isNearLastItem && lastItem !== this.draggedElement) {
          lastItem.classList.add("drop-target")
          // Применяем стабильное смещение вместо динамического
          if (!lastItem.hasAttribute("data-shifted")) {
            lastItem.style.transform = "translateX(-15px)"
            lastItem.setAttribute("data-shifted", "true")
          }
        }
      }
      return
    }

    // Определяем положение курсора относительно элемента
    const targetRect = target.getBoundingClientRect()
    const mouseX = e.clientX

    // Вычисляем относительную позицию по горизонтали (в процентах)
    const relativeX = ((mouseX - targetRect.left) / targetRect.width) * 100

    // Отслеживаем текущее положение и сохраняем предыдущее состояние
    let currentZone = ""
    let previousZone = ""

    // Проверяем текущие классы элемента, чтобы определить предыдущее состояние
    if (target.classList.contains("drop-target-above")) {
      previousZone = "left"
    } else if (target.classList.contains("drop-target")) {
      previousZone = "right"
    } else if (target.classList.contains("highlight")) {
      previousZone = "center"
    }

    // Определяем текущую зону на основе типа элемента и положения курсора
    if (target.classList.contains("folder")) {
      // Для папок: левый край (25%), середина (50%), правый край (25%)
      if (relativeX <= 25) {
        currentZone = "left"
      } else if (relativeX >= 75) {
        currentZone = "right"
      } else {
        currentZone = "center"
      }
    } else {
      // Для закладок: левый край (50%), правый край (50%)
      if (relativeX < 50) {
        currentZone = "left"
      } else {
        currentZone = "right"
      }
    }

    // Если зона не изменилась и элемент уже имеет соответствующий класс, выходим
    if (currentZone === previousZone && target.hasAttribute("data-shifted")) {
      return
    }

    // Очищаем предыдущие эффекты для этого элемента
    target.classList.remove("drop-target")
    target.classList.remove("drop-target-above")
    target.classList.remove("highlight")
    target.removeAttribute("data-hover-text")

    // Убираем эффекты с других элементов
    const otherElements = Array.from(
      this.container.querySelectorAll(
        ".bookmark-item:not([data-id='" + target.dataset.id + "'])"
      )
    ).filter(
      (el) =>
        el.classList.contains("drop-target") ||
        el.classList.contains("drop-target-above") ||
        el.classList.contains("highlight")
    )

    otherElements.forEach((el) => {
      el.classList.remove("drop-target")
      el.classList.remove("drop-target-above")
      el.classList.remove("highlight")
      el.style.transform = ""
      el.removeAttribute("data-hover-text")
      el.removeAttribute("data-shifted")
    })

    // Применяем соответствующий эффект в зависимости от зоны
    if (target.classList.contains("folder")) {
      if (currentZone === "left") {
        // Левая часть - вставить перед папкой
        target.classList.add("drop-target-above")
        target.style.transform = "translateX(15px)"
        target.setAttribute("data-shifted", "true")
      } else if (currentZone === "right") {
        // Правая часть - вставить после папки
        target.classList.add("drop-target")
        target.style.transform = "translateX(-15px)"
        target.setAttribute("data-shifted", "true")
      } else {
        // Центральная часть - вставить внутрь папки
        target.classList.add("highlight")
        this.lastHoveredFolder = target
        target.style.transform = "scale(1.02)"
        target.setAttribute("data-shifted", "true")
        target.setAttribute("data-hover-text", i18n.t("DRAG_DROP.FOLDER_HOVER"))

        if (!this.folderHoverStartTime) {
          this.folderHoverStartTime = Date.now()
        }
      }
    } else {
      // Обычная закладка (не папка)
      if (currentZone === "left") {
        // Левая часть - вставить перед
        target.classList.add("drop-target-above")
        target.style.transform = "translateX(15px)"
        target.setAttribute("data-shifted", "true")
      } else if (currentZone === "right") {
        // Правая часть - вставить после
        target.classList.add("drop-target")
        target.style.transform = "translateX(-15px)"
        target.setAttribute("data-shifted", "true")
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

    // Не очищаем эффекты сразу, а проверяем, действительно ли курсор покинул элемент
    // Получаем текущие координаты курсора
    const x = e.clientX
    const y = e.clientY

    // Сохраняем ссылку на элемент для использования в setTimeout
    const currentTarget = target

    // Используем setTimeout с нулевой задержкой для обработки после текущего цикла событий
    // Это позволит проверить не появились ли новые события dragenter/dragover
    setTimeout(() => {
      // Только если элемент всё ещё присутствует в DOM
      if (!currentTarget || !currentTarget.parentNode) return

      // Получаем самый верхний элемент по текущим координатам курсора
      const elementAtPoint = document.elementFromPoint(x, y)

      // Если элемент под курсором - null или body/html, значит курсор вне окна
      if (
        !elementAtPoint ||
        elementAtPoint.tagName === "BODY" ||
        elementAtPoint.tagName === "HTML"
      ) {
        this.clearEffectsForElement(currentTarget)
        return
      }

      // Проверяем, покинул ли курсор элемент полностью (с учетом вложенности)
      const isStillInTarget =
        currentTarget.contains(elementAtPoint) ||
        elementAtPoint.closest(".bookmark-item") === currentTarget

      // Если курсор все еще над элементом или его дочерними элементами, сохраняем эффекты
      if (isStillInTarget) {
        return
      }

      // Проверяем по расширенным границам
      const rect = currentTarget.getBoundingClientRect()
      const extendedRect = {
        left: rect.left - 30,
        right: rect.right + 30,
        top: rect.top - 5,
        bottom: rect.bottom + 5,
      }

      // Если курсор все еще в пределах расширенной зоны, не снимаем эффекты
      if (
        x >= extendedRect.left &&
        x <= extendedRect.right &&
        y >= extendedRect.top &&
        y <= extendedRect.bottom
      ) {
        return
      }

      // Если курсор действительно покинул элемент, очищаем эффекты
      this.clearEffectsForElement(currentTarget)
    }, 0)
  }

  /**
   * Очищает эффекты для конкретного элемента
   * @param {HTMLElement} element - Элемент, для которого нужно очистить эффекты
   */
  clearEffectsForElement(element) {
    if (!element || !element.parentNode) return

    // Удаляем индикаторы перетаскивания и сбрасываем трансформацию
    element.classList.remove("drop-target")
    element.classList.remove("drop-target-above")

    // Плавно сбрасываем трансформацию
    element.style.transition = "transform 0.15s ease-out"
    element.style.transform = ""

    // Через небольшую задержку возвращаем оригинальный transition
    setTimeout(() => {
      if (element && element.parentNode) {
        element.style.transition = ""
      }
    }, 150)

    // Удаляем атрибут подсказки
    element.removeAttribute("data-hover-text")
    element.removeAttribute("data-shifted")

    // Если это папка, удаляем выделение
    if (
      element.classList.contains("folder") &&
      element === this.lastHoveredFolder
    ) {
      element.classList.remove("highlight")
      this.lastHoveredFolder = null

      // Сбрасываем время начала наведения на папку
      this.folderHoverStartTime = null
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

    // Добавляем класс для плавной анимации завершения перетаскивания
    document.body.classList.add("dropping")

    // Создаем переменные вне блока try для доступа из finally
    let target = null
    let currentFolderId = null

    try {
      // Получаем целевой элемент
      target = e.target.closest(".bookmark-item")
      currentFolderId = this.navigationModule.getCurrentParentId()

      // Если сброс вне элементов (в пустую область)
      if (!target) {
        const isOverEmptyArea =
          e.target === this.container ||
          e.target.classList.contains("empty-message") ||
          e.target.classList.contains("main-content") ||
          e.target.closest(".main-content") === this.container

        // Проверяем, находится ли курсор вблизи последнего элемента
        if (isOverEmptyArea && this.container.children.length > 0) {
          const items = Array.from(
            this.container.querySelectorAll(".bookmark-item")
          ).filter((item) => item !== this.draggedElement)

          // Если в списке нет элементов (кроме перетаскиваемого), просто перемещаем в текущую папку
          if (items.length === 0) {
            await this.moveToEndOfList(currentFolderId)
            return
          }

          const lastItem = items[items.length - 1]

          // Получаем размеры и позицию последнего элемента
          const lastItemRect = lastItem.getBoundingClientRect()
          // Проверяем, находится ли курсор в пределах 30px по горизонтали от последнего элемента
          const isNearLastItem =
            Math.abs(e.clientX - (lastItemRect.right + 15)) < 30

          if (isNearLastItem) {
            log(`Перемещение в конец списка в папке ${currentFolderId}`)
            await this.moveToEndOfList(currentFolderId)
            return
          }

          // Если курсор не близко к последнему элементу, игнорируем событие
          return
        }

        return
      }

      // Если пытаемся перетащить на самого себя
      if (target === this.draggedElement) {
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
        // Если нет явных классов, определяем по положению курсора
        const targetRect = target.getBoundingClientRect()
        const mouseX = e.clientX
        const relativeX = ((mouseX - targetRect.left) / targetRect.width) * 100

        if (
          target.classList.contains("folder") &&
          relativeX > 25 &&
          relativeX < 75
        ) {
          // Если это папка и курсор в центральной части
          const targetFolderId = target.dataset.id

          // Проверка, чтобы не перемещать папку в саму себя
          if (this.draggedElementId === targetFolderId) {
            logWarn("Нельзя переместить папку в саму себя")
            this.uiModule.showNotification(
              i18n.t("DRAG_DROP.FOLDER_SELF_ERROR"),
              "error"
            )
            return
          }

          await this.moveIntoFolder(targetFolderId)
        } else {
          // Определяем положение относительно центра элемента
          if (target.classList.contains("folder")) {
            // Для папок: делим на 3 зоны
            if (relativeX <= 25) {
              // Левый край 25% - вставить перед папкой
              log(
                `Перемещение элемента ${this.draggedElementId} перед ${target.dataset.id} (по позиции мыши)`
              )
              await this.reorderBeforeTarget(target.dataset.id, currentFolderId)
            } else if (relativeX >= 75) {
              // Правый край 25% - вставить после папки
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
            } else {
              // Центральная 50% - вставить внутрь папки
              await this.moveIntoFolder(target.dataset.id)
            }
          } else {
            // Для закладок: делим на 2 зоны
            if (relativeX < 50) {
              // Левая 50% - вставить перед
              log(
                `Перемещение элемента ${this.draggedElementId} перед ${target.dataset.id} (по позиции мыши)`
              )
              await this.reorderBeforeTarget(target.dataset.id, currentFolderId)
            } else {
              // Правая 50% - вставить после
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
        }
      }
    } catch (error) {
      logError("Ошибка при обработке события drop:", error)
      // Обновляем представление в случае ошибки
      window.dispatchEvent(
        new CustomEvent("refresh-view", { detail: { force: true } })
      )
    } finally {
      // Очищаем все эффекты с небольшой задержкой для завершения анимации
      setTimeout(() => {
        this.clearHoverEffects()
        document.body.classList.remove("dropping")

        // Сбрасываем флаг блокировки обновления через некоторое время
        setTimeout(() => {
          window.preventRefreshAfterDrop = false
        }, 100)
      }, 50)
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
      this.clearEffectsForElement(this.lastHoveredFolder)
      this.lastHoveredFolder = null
    }

    // Очищаем все индикаторы перетаскивания
    const dropTargets = this.container.querySelectorAll(
      ".drop-target, .drop-target-above, .highlight"
    )

    // Обрабатываем каждый элемент
    dropTargets.forEach((el) => {
      this.clearEffectsForElement(el)
    })
  }

  /**
   * Показывает подсказку о перетаскивании
   * @param {string} text - Текст подсказки
   */
  showDraggingTooltip(text) {
    // Отключаем отображение всплывающих подсказок
    return
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
    document.body.classList.remove("dragging-active")

    // Сбрасываем переменные
    this.draggedElement = null
    this.draggedElementId = null
    this.draggedElementType = null
    this.pendingDragElement = null

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

    // Удаляем обработчики mousedown и mouseup
    this.container.removeEventListener("mousedown", this.handleMouseDown)
    document.removeEventListener("mouseup", this.handleMouseUp)
    document.removeEventListener("mousemove", this.handleMouseMoveGlobal)

    // Очищаем все таймеры
    if (this.mouseDownTimer) {
      clearTimeout(this.mouseDownTimer)
      this.mouseDownTimer = null
    }

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
    this.pendingDragElement = null

    // Удаляем классы от body
    document.body.classList.remove("dragging")
    document.body.classList.remove("dragging-active")

    log("DragDropModule уничтожен")
  }
}
