import { Modal } from "./Modal.js"
import { i18n } from "../utils/i18n.js"
import { log, logError } from "../utils/logging.js"

/**
 * Класс для работы с модальным окном заметок
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

    // Заголовок
    const header = document.createElement("div")
    header.className = "modal-header"
    header.textContent = title

    // Содержимое
    const content = document.createElement("div")
    content.className = "modal-content"

    // Обертка для редактора
    const editorWrapper = document.createElement("div")
    editorWrapper.className = "note-editor-wrapper"

    // Поле для заголовка заметки
    const titleGroup = document.createElement("div")
    titleGroup.className = "modal-input-group"

    const titleLabel = document.createElement("label")
    titleLabel.htmlFor = "note-title"
    titleLabel.textContent = i18n.t("LABELS.NOTE_TITLE")

    this.editorTitle = document.createElement("input")
    this.editorTitle.id = "note-title"
    this.editorTitle.type = "text"
    this.editorTitle.className = "note-editor-title"
    this.editorTitle.value = initialData.title || ""

    titleGroup.appendChild(titleLabel)
    titleGroup.appendChild(this.editorTitle)

    // Если есть дата создания, показываем ее
    if (initialData.createdAt) {
      const createdAt = document.createElement("div")
      createdAt.className = "note-created-at"

      const date = new Date(initialData.createdAt)
      createdAt.textContent = `${i18n.t(
        "LABELS.CREATED_AT"
      )}: ${date.toLocaleString()}`

      titleGroup.appendChild(createdAt)
    }

    // Добавляем поле содержимого только если это режим редактирования
    if (this.isEditMode) {
      // Поле для содержимого заметки
      const contentGroup = document.createElement("div")
      contentGroup.className = "modal-input-group"
      contentGroup.style.flex = "1"

      const contentLabel = document.createElement("label")
      contentLabel.htmlFor = "note-content"
      contentLabel.textContent = i18n.t("LABELS.NOTE_CONTENT")

      this.editorContent = document.createElement("textarea")
      this.editorContent.id = "note-content"
      this.editorContent.className = "note-editor-content"
      this.editorContent.value = initialData.content || ""
      this.editorContent.placeholder =
        i18n.t("PLACEHOLDERS.NOTE_CONTENT") || "Введите текст заметки..."

      contentGroup.appendChild(contentLabel)
      contentGroup.appendChild(this.editorContent)

      // Добавляем группу содержимого в обертку
      editorWrapper.appendChild(contentGroup)
    }

    // Добавляем элементы в обертку
    editorWrapper.appendChild(titleGroup)
    content.appendChild(editorWrapper)

    // Кнопки
    const buttons = document.createElement("div")
    buttons.className = "modal-footer"

    const cancelButton = document.createElement("button")
    cancelButton.textContent = i18n.t("BUTTONS.CANCEL")
    cancelButton.className = "cancel"
    cancelButton.onclick = () => this.close()

    const saveButton = document.createElement("button")
    saveButton.textContent = i18n.t("BUTTONS.SAVE")
    saveButton.className = "save-button"
    saveButton.onclick = () => this.handleSave()

    buttons.appendChild(cancelButton)
    buttons.appendChild(saveButton)

    // Собираем модальное окно
    this.modal.appendChild(header)
    this.modal.appendChild(content)
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

    // Фокус на поле заголовка
    setTimeout(() => {
      this.editorTitle.focus()
    }, 100)
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

      // В режиме создания заметки, пустое содержимое
      // В режиме редактирования, берем содержимое из редактора
      const content =
        this.isEditMode && this.editorContent
          ? this.editorContent.value || ""
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
          this.close()
        }
      } else {
        this.close()
      }
    } catch (error) {
      logError("Ошибка при сохранении заметки:", error)
    }
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
