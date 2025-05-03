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

    // Инициализация редактора
    this.pellEditor = window.pell.init({
      element: document.getElementById(this.pellContainerId),
      onChange: (html) => {
        // HTML контент обновляется автоматически
      },
      defaultParagraphSeparator: "p",
      styleWithCSS: true,
      actions: [
        "bold",
        "italic",
        "underline",
        "strikethrough",
        "heading1",
        "heading2",
        "paragraph",
        "quote",
        "olist",
        "ulist",
        "line",
        {
          name: "link",
          result: () => {
            const url = window.prompt(
              i18n.t("PROMPTS.ENTER_LINK") || "Введите URL ссылки"
            )
            if (url) window.pell.exec("createLink", url)
          },
        },
        {
          name: "foreColor",
          icon: "⬤",
          title: "Цвет текста",
          result: () => {
            const color = window.prompt(
              i18n.t("PROMPTS.ENTER_COLOR") ||
                "Введите цвет (например, #24ffd0 или red)",
              "#24ffd0"
            )
            if (color) window.pell.exec("foreColor", color)
          },
        },
        {
          name: "backColor",
          icon: "◼",
          title: "Цвет фона",
          result: () => {
            const color = window.prompt(
              i18n.t("PROMPTS.ENTER_BACKGROUND_COLOR") ||
                "Введите цвет фона (например, #f0f0f0 или yellow)",
              "#f0f0f0"
            )
            if (color) window.pell.exec("backColor", color)
          },
        },
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

    // Делаем ссылки в редакторе кликабельными
    if (this.pellEditor.content) {
      this.pellEditor.content.addEventListener("click", (e) => {
        // Проверяем, был ли клик по ссылке
        if (e.target.tagName === "A") {
          // Открываем ссылку в новой вкладке
          e.preventDefault()
          const url = e.target.getAttribute("href")
          if (url) {
            window.open(url, "_blank")
          }
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
