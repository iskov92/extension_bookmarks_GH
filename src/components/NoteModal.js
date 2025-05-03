import { Modal } from "./Modal.js"
import { i18n } from "../utils/i18n.js"
import { log, logError } from "../utils/logging.js"

/**
 * Класс для работы с модальным окном заметок с интегрированным текстовым редактором Pell
 */
export class NoteModal extends Modal {
  /**
   * Инициализирует объект модального окна для заметок
   */
  constructor() {
    super()
    this.type = "note"
    this.editorContent = null
    this.editorTitle = null
    this.isEditMode = false
    this.pellEditor = null
    this.pellInitialized = false
    this.isEditing = false // Флаг, указывающий находимся ли мы в режиме редактирования
    this.viewContent = null // Элемент просмотра содержимого заметки
  }

  /**
   * Создает модальное окно для редактирования заметки
   * @param {string} title - Заголовок окна
   * @param {Object} initialData - Начальные данные заметки (title, content, createdAt)
   * @param {Function} onSave - Функция, вызываемая при сохранении
   */
  create(title, initialData = {}, onSave = null) {
    this.onSave = onSave
    this.initialData = initialData

    // Определяем, находимся ли мы в режиме редактирования существующей заметки
    this.isEditMode = initialData && initialData.id

    // Создаем оверлей
    this.overlay = document.createElement("div")
    this.overlay.className = "modal-overlay"

    // Создаем модальное окно
    this.modal = document.createElement("div")
    this.modal.className = "modal note-modal"

    // Заголовок модального окна (компактная шапка)
    const header = document.createElement("div")
    header.className = "modal-header note-modal-header"

    // Контейнер для заголовка
    const headerContainer = document.createElement("div")
    headerContainer.className = "note-header-container"

    // Поле для заголовка заметки
    this.editorTitle = document.createElement("input")
    this.editorTitle.type = "text"
    this.editorTitle.className = "note-editor-title"
    this.editorTitle.value = initialData.title || ""
    this.editorTitle.placeholder =
      i18n.t("PLACEHOLDERS.NOTE_TITLE") || "Введите название заметки..."
    this.editorTitle.readOnly = this.isEditMode && !this.isEditing

    // Метка редактора заметки
    const editorLabel = document.createElement("div")
    editorLabel.className = "note-editor-label"
    editorLabel.textContent = this.isEditMode
      ? initialData.title || i18n.t("LABELS.NOTE_EDITOR") || "Редактор заметки"
      : i18n.t("LABELS.NOTE_EDITOR") || "Редактор заметки"

    // Добавляем элементы в шапку
    headerContainer.appendChild(this.editorTitle)
    headerContainer.appendChild(editorLabel)
    header.appendChild(headerContainer)

    // Содержимое
    this.content = document.createElement("div")
    this.content.className = "modal-content note-editor-container"

    // Контейнер для режима просмотра
    this.viewModeContainer = document.createElement("div")
    this.viewModeContainer.className = "note-view-mode"

    // Кнопка "Редактировать" добавляется перед контентом
    this.editButton = document.createElement("button")
    this.editButton.className = "note-edit-button"
    this.editButton.textContent = i18n.t("BUTTONS.EDIT") || "Редактировать"
    this.editButton.onclick = () => this.switchToEditMode()

    // Контент заметки в режиме просмотра
    this.viewContent = document.createElement("div")
    this.viewContent.className = "note-content-view"
    this.viewContent.innerHTML = initialData.content || ""

    this.viewModeContainer.appendChild(this.editButton)
    this.viewModeContainer.appendChild(this.viewContent)

    // Контейнер для редактора Pell
    this.editModeContainer = document.createElement("div")
    this.editModeContainer.className = "pell-container"
    this.editModeContainer.id = "pell-editor-" + Date.now()
    this.pellContainerId = this.editModeContainer.id
    this.editModeContainer.style.display = "none" // Скрываем редактор по умолчанию

    // Если мы создаем новую заметку, сразу показываем редактор
    if (!this.isEditMode) {
      this.isEditing = true
      this.editModeContainer.style.display = "flex"
      this.viewModeContainer.style.display = "none"
      this.editorTitle.readOnly = false
    }

    this.content.appendChild(this.viewModeContainer)
    this.content.appendChild(this.editModeContainer)

    // Кнопки и информация о создании
    const buttons = document.createElement("div")
    buttons.className = "modal-footer note-modal-footer"

    // Информация о создании
    let createdAtInfo = ""
    if (initialData.createdAt) {
      const date = new Date(initialData.createdAt)
      createdAtInfo = `${i18n.t("LABELS.CREATED_AT")}: ${date.toLocaleString()}`
    }

    const createdAt = document.createElement("div")
    createdAt.className = "note-created-at"
    createdAt.textContent = createdAtInfo

    // Контейнер для кнопок
    this.buttonsContainer = document.createElement("div")
    this.buttonsContainer.className = "note-buttons-container"

    const cancelButton = document.createElement("button")
    cancelButton.textContent = i18n.t("BUTTONS.CANCEL")
    cancelButton.className = "cancel-button"
    cancelButton.onclick = () => this.close()

    // Создаем кнопку сохранения, но скрываем её в режиме просмотра
    this.saveButton = document.createElement("button")
    this.saveButton.textContent = i18n.t("BUTTONS.SAVE")
    this.saveButton.className = "save-button"
    this.saveButton.onclick = () => this.handleSave()

    // Скрываем кнопку сохранения в режиме просмотра для существующих заметок
    if (this.isEditMode && !this.isEditing) {
      this.saveButton.style.display = "none"
    }

    this.buttonsContainer.appendChild(cancelButton)
    this.buttonsContainer.appendChild(this.saveButton)

    buttons.appendChild(createdAt)
    buttons.appendChild(this.buttonsContainer)

    // Собираем модальное окно
    this.modal.appendChild(header)
    this.modal.appendChild(this.content)
    this.modal.appendChild(buttons)

    this.overlay.appendChild(this.modal)
    document.body.appendChild(this.overlay)

    // Закрытие по клику вне модального окна
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) {
        this.close()
      }
    })

    // Предотвращаем закрытие по клику внутри модального окна
    this.modal.addEventListener("click", (e) => {
      e.stopPropagation()
    })

    // Добавляем обработчик Escape
    const escHandler = (e) => {
      if (e.key === "Escape") {
        this.close()
        document.removeEventListener("keydown", escHandler)
      }
    }
    document.addEventListener("keydown", escHandler)

    // Событие для обновления метки при изменении заголовка
    this.editorTitle.addEventListener("input", () => {
      editorLabel.textContent =
        this.editorTitle.value.trim() ||
        i18n.t("LABELS.NOTE_EDITOR") ||
        "Редактор заметки"
    })

    // Добавляем обработчик кликов для ссылок в режиме просмотра
    this.viewContent.addEventListener("click", (e) => {
      if (e.target.tagName === "A") {
        e.preventDefault()
        const url = e.target.getAttribute("href")
        if (url) {
          window.open(url, "_blank")
        }
      }
    })

    // Инициализируем редактор Pell после добавления элементов в DOM
    setTimeout(() => {
      if (this.isEditing || !this.isEditMode) {
        this.initPellEditor(initialData.content || "")
        this.editorTitle.focus()
      }
    }, 100)
  }

  /**
   * Переключает модальное окно в режим редактирования
   */
  switchToEditMode() {
    this.isEditing = true
    this.viewModeContainer.style.display = "none"
    this.editModeContainer.style.display = "flex"
    this.saveButton.style.display = "block"
    this.editorTitle.readOnly = false
    this.editorTitle.focus()

    // Если редактор еще не инициализирован, инициализируем его
    if (!this.pellInitialized) {
      this.initPellEditor(this.initialData.content || "")
    }
  }

  /**
   * Переключает модальное окно в режим просмотра
   */
  switchToViewMode() {
    this.isEditing = false
    this.editModeContainer.style.display = "none"
    this.viewModeContainer.style.display = "flex"
    this.saveButton.style.display = "none"
    this.editorTitle.readOnly = true

    // Обновляем содержимое в режиме просмотра
    if (this.pellInitialized && this.pellEditor) {
      this.viewContent.innerHTML = this.pellEditor.content.innerHTML
    }
  }

  /**
   * Инициализирует редактор текста Pell
   * @param {string} content - Начальное содержимое редактора
   */
  initPellEditor(content) {
    if (!window.pell) {
      console.error(
        "Pell editor not found. Make sure to include pell.js and pell.css"
      )
      return
    }

    // Создаем собственные кнопки цвета с иконками
    const textColorButton = {
      name: "foreColor",
      icon: '<span style="font-weight: bold; color: red; font-family: serif;">A</span>',
      title: i18n.t("LABELS.TEXT_COLOR") || "Цвет текста",
      result: () => {
        // Получаем текущее выделение
        const selection = window.getSelection()
        if (!selection.rangeCount) return

        // Сохраняем выделение для последующего применения цвета
        const selRange = selection.getRangeAt(0)

        // Создаем контейнер для палитры
        const palette = document.createElement("div")
        palette.className = "color-palette"
        palette.style.position = "fixed" // фиксированное позиционирование
        palette.style.zIndex = "9999" // высокий z-index чтобы быть поверх всего
        palette.style.display = "flex"
        palette.style.flexDirection = "column" // вертикальное расположение с полем ввода внизу
        palette.style.width = "180px"
        palette.style.background = "var(--bg-primary)"
        palette.style.border = "1px solid var(--border-color)"
        palette.style.borderRadius = "4px"
        palette.style.padding = "5px"
        palette.style.boxShadow = "0 3px 8px rgba(0,0,0,0.3)"

        // Создаем контейнер для цветов
        const colorsContainer = document.createElement("div")
        colorsContainer.style.display = "flex"
        colorsContainer.style.flexWrap = "wrap"
        colorsContainer.style.marginBottom = "5px"

        // Предопределенные цвета
        const colors = [
          "#000000",
          "#434343",
          "#666666",
          "#999999",
          "#b7b7b7",
          "#cccccc",
          "#d9d9d9",
          "#efefef",
          "#f3f3f3",
          "#ffffff",
          "#980000",
          "#ff0000",
          "#ff9900",
          "#ffff00",
          "#00ff00",
          "#00ffff",
          "#4a86e8",
          "#0000ff",
          "#9900ff",
          "#ff00ff",
        ]

        // Добавляем цветовые ячейки
        colors.forEach((color) => {
          const colorCell = document.createElement("div")
          colorCell.style.width = "20px"
          colorCell.style.height = "20px"
          colorCell.style.margin = "2px"
          colorCell.style.backgroundColor = color
          colorCell.style.cursor = "pointer"
          colorCell.style.borderRadius = "2px"
          colorCell.title = color

          colorCell.addEventListener("click", () => {
            // Восстанавливаем выделение и применяем цвет
            selection.removeAllRanges()
            selection.addRange(selRange)
            window.pell.exec("foreColor", color)
            document.body.removeChild(palette)
          })

          colorsContainer.appendChild(colorCell)
        })

        // Кнопка сброса цвета текста
        const resetButton = document.createElement("button")
        resetButton.textContent = "Сбросить"
        resetButton.style.margin = "5px 0"
        resetButton.style.padding = "3px 8px"
        resetButton.style.background = "var(--bg-secondary)"
        resetButton.style.border = "1px solid var(--border-color)"
        resetButton.style.borderRadius = "3px"
        resetButton.style.cursor = "pointer"
        resetButton.style.fontSize = "12px"
        resetButton.style.width = "100%"
        resetButton.title = "Вернуть цвет текста по умолчанию"

        resetButton.addEventListener("click", () => {
          // Восстанавливаем выделение и сбрасываем цвет к цвету, заданному в CSS
          selection.removeAllRanges()
          selection.addRange(selRange)
          window.pell.exec("foreColor", "inherit")
          document.body.removeChild(palette)
        })

        // Создаем контейнер для поля ввода и кнопки
        const inputContainer = document.createElement("div")
        inputContainer.style.display = "flex"
        inputContainer.style.marginTop = "5px"

        // Поле для ввода HTML-кода цвета
        const colorInput = document.createElement("input")
        colorInput.type = "text"
        colorInput.placeholder = "#hex или имя цвета"
        colorInput.style.flex = "1"
        colorInput.style.marginRight = "5px"
        colorInput.style.padding = "3px 5px"
        colorInput.style.border = "1px solid var(--border-color)"
        colorInput.style.borderRadius = "3px"
        colorInput.style.fontSize = "12px"

        // Кнопка OK
        const okButton = document.createElement("button")
        okButton.textContent = "OK"
        okButton.style.padding = "3px 8px"
        okButton.style.background = "var(--accent-color)"
        okButton.style.border = "none"
        okButton.style.borderRadius = "3px"
        okButton.style.cursor = "pointer"
        okButton.style.fontSize = "12px"
        okButton.style.color = "#000"

        // При клике на кнопку OK применяем введенный цвет
        okButton.addEventListener("click", () => {
          if (colorInput.value) {
            // Восстанавливаем выделение и применяем цвет
            selection.removeAllRanges()
            selection.addRange(selRange)
            window.pell.exec("foreColor", colorInput.value)
          }
          document.body.removeChild(palette)
        })

        // Добавляем элементы в контейнеры
        inputContainer.appendChild(colorInput)
        inputContainer.appendChild(okButton)

        palette.appendChild(colorsContainer)
        palette.appendChild(resetButton)
        palette.appendChild(inputContainer)

        // Определяем позицию для палитры относительно курсора
        const range = selRange
        const rect = range.getBoundingClientRect()

        // Позиционируем палитру над курсором
        palette.style.top = `${rect.top - palette.offsetHeight - 10}px`
        palette.style.left = `${rect.left}px`

        // Добавляем палитру к DOM
        document.body.appendChild(palette)

        // Корректируем позицию, если выходит за пределы окна
        const paletteRect = palette.getBoundingClientRect()
        if (paletteRect.top < 10) {
          // Если палитра выходит за верхнюю границу, размещаем под курсором
          palette.style.top = `${rect.bottom + 10}px`
        }

        if (paletteRect.right > window.innerWidth - 10) {
          // Если палитра выходит за правую границу
          palette.style.left = `${window.innerWidth - paletteRect.width - 10}px`
        }

        // Добавляем обработчик для закрытия палитры при клике вне неё
        const closeOnClickOutside = (e) => {
          if (!palette.contains(e.target)) {
            document.body.removeChild(palette)
            document.removeEventListener("mousedown", closeOnClickOutside)
          }
        }

        // Регистрируем обработчик
        setTimeout(() => {
          document.addEventListener("mousedown", closeOnClickOutside)
        }, 10)

        // Фокус на поле ввода
        colorInput.focus()
      },
    }

    const backColorButton = {
      name: "backColor",
      icon: '<span style="background-color: red; color: white; font-family: serif; border: 1px solid #000; display: inline-block; width: 14px; height: 14px; text-align: center; line-height: 14px;">A</span>',
      title: i18n.t("LABELS.BACKGROUND_COLOR") || "Цвет фона",
      result: () => {
        // Получаем текущее выделение
        const selection = window.getSelection()
        if (!selection.rangeCount) return

        // Сохраняем выделение для последующего применения цвета
        const selRange = selection.getRangeAt(0)

        // Создаем контейнер для палитры
        const palette = document.createElement("div")
        palette.className = "color-palette"
        palette.style.position = "fixed" // фиксированное позиционирование
        palette.style.zIndex = "9999" // высокий z-index чтобы быть поверх всего
        palette.style.display = "flex"
        palette.style.flexDirection = "column" // вертикальное расположение с полем ввода внизу
        palette.style.width = "180px"
        palette.style.background = "var(--bg-primary)"
        palette.style.border = "1px solid var(--border-color)"
        palette.style.borderRadius = "4px"
        palette.style.padding = "5px"
        palette.style.boxShadow = "0 3px 8px rgba(0,0,0,0.3)"

        // Создаем контейнер для цветов
        const colorsContainer = document.createElement("div")
        colorsContainer.style.display = "flex"
        colorsContainer.style.flexWrap = "wrap"
        colorsContainer.style.marginBottom = "5px"

        // Предопределенные цвета
        const colors = [
          "#000000",
          "#434343",
          "#666666",
          "#999999",
          "#b7b7b7",
          "#cccccc",
          "#d9d9d9",
          "#efefef",
          "#f3f3f3",
          "#ffffff",
          "#980000",
          "#ff0000",
          "#ff9900",
          "#ffff00",
          "#00ff00",
          "#00ffff",
          "#4a86e8",
          "#0000ff",
          "#9900ff",
          "#ff00ff",
        ]

        // Добавляем цветовые ячейки
        colors.forEach((color) => {
          const colorCell = document.createElement("div")
          colorCell.style.width = "20px"
          colorCell.style.height = "20px"
          colorCell.style.margin = "2px"
          colorCell.style.backgroundColor = color
          colorCell.style.cursor = "pointer"
          colorCell.style.borderRadius = "2px"
          colorCell.title = color

          colorCell.addEventListener("click", () => {
            // Восстанавливаем выделение и применяем цвет
            selection.removeAllRanges()
            selection.addRange(selRange)
            window.pell.exec("backColor", color)
            document.body.removeChild(palette)
          })

          colorsContainer.appendChild(colorCell)
        })

        // Кнопка сброса цвета фона
        const resetButton = document.createElement("button")
        resetButton.textContent = "Сбросить"
        resetButton.style.margin = "5px 0"
        resetButton.style.padding = "3px 8px"
        resetButton.style.background = "var(--bg-secondary)"
        resetButton.style.border = "1px solid var(--border-color)"
        resetButton.style.borderRadius = "3px"
        resetButton.style.cursor = "pointer"
        resetButton.style.fontSize = "12px"
        resetButton.style.width = "100%"
        resetButton.title = "Вернуть цвет фона по умолчанию"

        resetButton.addEventListener("click", () => {
          // Восстанавливаем выделение и сбрасываем цвет фона к прозрачному
          selection.removeAllRanges()
          selection.addRange(selRange)
          window.pell.exec("backColor", "transparent")
          document.body.removeChild(palette)
        })

        // Создаем контейнер для поля ввода и кнопки
        const inputContainer = document.createElement("div")
        inputContainer.style.display = "flex"
        inputContainer.style.marginTop = "5px"

        // Поле для ввода HTML-кода цвета
        const colorInput = document.createElement("input")
        colorInput.type = "text"
        colorInput.placeholder = "#hex или имя цвета"
        colorInput.style.flex = "1"
        colorInput.style.marginRight = "5px"
        colorInput.style.padding = "3px 5px"
        colorInput.style.border = "1px solid var(--border-color)"
        colorInput.style.borderRadius = "3px"
        colorInput.style.fontSize = "12px"

        // Кнопка OK
        const okButton = document.createElement("button")
        okButton.textContent = "OK"
        okButton.style.padding = "3px 8px"
        okButton.style.background = "var(--accent-color)"
        okButton.style.border = "none"
        okButton.style.borderRadius = "3px"
        okButton.style.cursor = "pointer"
        okButton.style.fontSize = "12px"
        okButton.style.color = "#000"

        // При клике на кнопку OK применяем введенный цвет
        okButton.addEventListener("click", () => {
          if (colorInput.value) {
            // Восстанавливаем выделение и применяем цвет
            selection.removeAllRanges()
            selection.addRange(selRange)
            window.pell.exec("backColor", colorInput.value)
          }
          document.body.removeChild(palette)
        })

        // Добавляем элементы в контейнеры
        inputContainer.appendChild(colorInput)
        inputContainer.appendChild(okButton)

        palette.appendChild(colorsContainer)
        palette.appendChild(resetButton)
        palette.appendChild(inputContainer)

        // Определяем позицию для палитры относительно курсора
        const range = selRange
        const rect = range.getBoundingClientRect()

        // Позиционируем палитру над курсором
        palette.style.top = `${rect.top - palette.offsetHeight - 10}px`
        palette.style.left = `${rect.left}px`

        // Добавляем палитру к DOM
        document.body.appendChild(palette)

        // Корректируем позицию, если выходит за пределы окна
        const paletteRect = palette.getBoundingClientRect()
        if (paletteRect.top < 10) {
          // Если палитра выходит за верхнюю границу, размещаем под курсором
          palette.style.top = `${rect.bottom + 10}px`
        }

        if (paletteRect.right > window.innerWidth - 10) {
          // Если палитра выходит за правую границу
          palette.style.left = `${window.innerWidth - paletteRect.width - 10}px`
        }

        // Добавляем обработчик для закрытия палитры при клике вне неё
        const closeOnClickOutside = (e) => {
          if (!palette.contains(e.target)) {
            document.body.removeChild(palette)
            document.removeEventListener("mousedown", closeOnClickOutside)
          }
        }

        // Регистрируем обработчик
        setTimeout(() => {
          document.addEventListener("mousedown", closeOnClickOutside)
        }, 10)

        // Фокус на поле ввода
        colorInput.focus()
      },
    }

    // Инициализация редактора
    this.pellEditor = window.pell.init({
      element: document.getElementById(this.pellContainerId),
      onChange: (html) => {
        // HTML контент обновляется автоматически
      },
      defaultParagraphSeparator: "p",
      styleWithCSS: true, // Устанавливаем true для поддержки изменения цвета текста
      actions: [
        "bold",
        "italic",
        "underline",
        "strikethrough",
        "heading1",
        "heading2",
        {
          name: "olist",
          icon: "1.",
        },
        "ulist",
        "line",
        {
          name: "link",
          icon: '<img src="/assets/logo/icon128.png" style="width: 16px; height: 16px; object-fit: contain;">',
          result: () => {
            const url = window.prompt(
              i18n.t("PROMPTS.ENTER_LINK") || "Введите URL ссылки"
            )
            if (url) {
              // Проверяем, содержит ли URL протокол
              let formattedUrl = url.trim()
              if (formattedUrl && !formattedUrl.match(/^https?:\/\//i)) {
                formattedUrl = "https://" + formattedUrl
              }
              window.pell.exec("createLink", formattedUrl)
            }
          },
        },
        // Добавляем кастомные кнопки для изменения цвета текста
        textColorButton,
        backColorButton,
      ],
      classes: {
        actionbar: "pell-actionbar",
        button: "pell-button",
        content: "pell-content note-editor-content",
        selected: "pell-button-selected",
      },
    })

    // Устанавливаем начальное содержимое
    if (content && this.pellEditor.content) {
      this.pellEditor.content.innerHTML = content
    }

    // Добавляем обработчики для ссылок в редакторе
    if (this.pellEditor.content) {
      this.pellEditor.content.addEventListener("click", (e) => {
        // Проверяем, был ли клик по ссылке
        if (e.target.tagName === "A") {
          // Всегда предотвращаем переход по ссылке
          e.preventDefault()

          // Если мы в режиме редактирования, предлагаем отредактировать ссылку
          if (this.isEditing) {
            const currentUrl = e.target.getAttribute("href")
            const newUrl = window.prompt(
              i18n.t("PROMPTS.EDIT_LINK") || "Редактировать URL ссылки",
              currentUrl || ""
            )

            if (newUrl !== null) {
              // Если не нажата кнопка "Отмена"
              if (newUrl.trim() === "") {
                // Если URL пустой, удаляем ссылку, оставляя текст
                const textContent = e.target.textContent
                const textNode = document.createTextNode(textContent)
                e.target.parentNode.replaceChild(textNode, e.target)
              } else {
                // Иначе обновляем URL ссылки
                let formattedUrl = newUrl.trim()
                if (formattedUrl && !formattedUrl.match(/^https?:\/\//i)) {
                  formattedUrl = "https://" + formattedUrl
                }
                e.target.setAttribute("href", formattedUrl)
              }
            }
          } else {
            // Если мы не в режиме редактирования, открываем ссылку в новой вкладке
            const url = e.target.getAttribute("href")
            if (url) {
              window.open(url, "_blank")
            }
          }
        }
      })

      // Отключаем стандартное поведение ссылок в режиме редактирования
      this.pellEditor.content.addEventListener("mousedown", (e) => {
        if (e.target.tagName === "A" && this.isEditing) {
          // Предотвращаем обычное поведение ссылки
          e.preventDefault()
        }
      })
    }

    this.pellInitialized = true
  }

  /**
   * Обрабатывает сохранение данных заметки
   */
  handleSave() {
    try {
      const title = this.editorTitle.value.trim()

      // Валидация
      if (!title) {
        alert(i18n.t("VALIDATIONS.EMPTY_NOTE_TITLE"))
        this.editorTitle.focus()
        return
      }

      // Получаем содержимое из редактора Pell
      const content =
        this.pellInitialized && this.pellEditor
          ? this.pellEditor.content.innerHTML
          : ""

      const noteData = {
        title,
        content,
        editedAt: Date.now(),
      }

      // Если были начальные данные, сохраняем ID и дату создания
      if (this.initialData) {
        if (this.initialData.id) noteData.id = this.initialData.id
        if (this.initialData.createdAt)
          noteData.createdAt = this.initialData.createdAt
      }

      if (this.onSave) {
        const result = this.onSave(noteData)
        if (result) {
          // Если это существующая заметка, переключаемся в режим просмотра
          if (this.isEditMode) {
            // Обновляем содержимое в режиме просмотра
            this.viewContent.innerHTML = content
            this.initialData.content = content
            this.switchToViewMode()
          } else {
            // Если это новая заметка, закрываем окно
            this.close()
          }
        }
      } else {
        this.close()
      }
    } catch (error) {
      logError("Ошибка при сохранении заметки:", error)
    }
  }

  /**
   * Очищает ресурсы перед закрытием модального окна
   */
  close() {
    this.pellEditor = null
    this.pellInitialized = false
    this.isEditing = false
    super.close()
  }

  /**
   * Показывает модальное окно заметки
   * @param {string} title - Заголовок окна
   * @param {Object} initialData - Начальные данные заметки (title, content, createdAt)
   * @param {Function} onSave - Функция, вызываемая при сохранении
   */
  show(title, initialData = {}, onSave = null) {
    this.create(title, initialData, onSave)
    return this
  }
}
