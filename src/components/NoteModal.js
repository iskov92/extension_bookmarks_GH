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

    // Метка редактора заметки
    const editorLabel = document.createElement("div")
    editorLabel.className = "note-editor-label"
    editorLabel.textContent = i18n.t("LABELS.NOTE_EDITOR") || "Редактор заметки"

    // Добавляем элементы в шапку
    headerContainer.appendChild(this.editorTitle)
    headerContainer.appendChild(editorLabel)
    header.appendChild(headerContainer)

    // Содержимое
    const content = document.createElement("div")
    content.className = "modal-content note-editor-container"

    // Поле для содержимого заметки
    this.editorContent = document.createElement("textarea")
    this.editorContent.className = "note-editor-content"
    this.editorContent.value = initialData.content || ""
    this.editorContent.placeholder =
      i18n.t("PLACEHOLDERS.NOTE_CONTENT") || "Введите текст заметки..."

    // Добавляем поле в содержимое
    content.appendChild(this.editorContent)

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
    const buttonsContainer = document.createElement("div")
    buttonsContainer.className = "note-buttons-container"

    const cancelButton = document.createElement("button")
    cancelButton.textContent = i18n.t("BUTTONS.CANCEL")
    cancelButton.className = "cancel-button"
    cancelButton.onclick = () => this.close()

    const saveButton = document.createElement("button")
    saveButton.textContent = i18n.t("BUTTONS.SAVE")
    saveButton.className = "save-button"
    saveButton.onclick = () => this.handleSave()

    buttonsContainer.appendChild(cancelButton)
    buttonsContainer.appendChild(saveButton)

    buttons.appendChild(createdAt)
    buttons.appendChild(buttonsContainer)

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

      const content = this.editorContent.value || ""

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
