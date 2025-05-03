import { i18n } from "../utils/i18n.js"

export class Modal {
  constructor() {
    this.modal = null
    this.overlay = null
    this.onSave = null
    this.onClose = null
    this.inputs = {} // Кеширование полей ввода
    this.type = null // Сохранение типа модального окна
  }

  create(title, type, initialData = {}, customContent = null) {
    this.type = type // Сохраняем тип окна
    this.overlay = document.createElement("div")
    this.overlay.className = "modal-overlay"

    this.modal = document.createElement("div")
    this.modal.className = "modal"

    const header = document.createElement("div")
    header.className = "modal-header"
    header.textContent = title
    header.dataset.translate = `MODALS.${type.toUpperCase()}`

    const content = document.createElement("div")
    content.className = "modal-content"

    if (customContent) {
      content.appendChild(customContent)
    } else if (type === "link") {
      const nameGroup = this.createInputGroup(
        "name",
        i18n.t("LABELS.BOOKMARK_NAME"),
        initialData.title || ""
      )
      const urlGroup = this.createInputGroup(
        "url",
        i18n.t("LABELS.BOOKMARK_URL"),
        initialData.url || ""
      )

      content.appendChild(nameGroup)
      content.appendChild(urlGroup)

      // Сохраняем ссылки на поля ввода
      this.inputs.name = nameGroup.querySelector("input")
      this.inputs.url = urlGroup.querySelector("input")

      // Добавляем обработчик нажатия Enter в поля ввода
      this.inputs.name.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault() // Предотвращаем действие по умолчанию
          if (this.onSave) {
            this.handleSave()
          }
        }
      })

      this.inputs.url.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault() // Предотвращаем действие по умолчанию
          if (this.onSave) {
            this.handleSave()
          }
        }
      })

      // Устанавливаем автофокус на первое поле
      setTimeout(() => {
        if (this.inputs.name) {
          this.inputs.name.focus()
          this.inputs.name.select() // Выделяем текст для быстрого редактирования
        }
      }, 100)
    } else if (type === "folder") {
      const nameGroup = this.createInputGroup(
        "name",
        i18n.t("LABELS.FOLDER_NAME"),
        initialData.title || ""
      )
      content.appendChild(nameGroup)

      // Сохраняем ссылку на поле ввода
      this.inputs.name = nameGroup.querySelector("input")

      // Добавляем обработчик нажатия Enter в поле ввода
      this.inputs.name.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault() // Предотвращаем действие по умолчанию
          if (this.onSave) {
            this.handleSave()
          }
        }
      })

      // Устанавливаем автофокус на поле ввода
      setTimeout(() => {
        if (this.inputs.name) {
          this.inputs.name.focus()
          this.inputs.name.select() // Выделяем текст для быстрого редактирования
        }
      }, 100)
    }

    const buttons = document.createElement("div")
    buttons.className = "modal-footer"

    const cancelButton = document.createElement("button")
    cancelButton.className = "cancel"
    cancelButton.textContent = i18n.t("BUTTONS.CANCEL")
    cancelButton.dataset.translate = "BUTTONS.CANCEL"
    cancelButton.onclick = () => {
      if (this.onClose) {
        this.onClose()
      } else {
        this.close()
      }
    }

    const saveButton = document.createElement("button")
    saveButton.className = "save-button"
    saveButton.textContent = i18n.t("BUTTONS.SAVE")
    saveButton.dataset.translate = "BUTTONS.SAVE"
    saveButton.onclick = () => {
      if (this.onSave) {
        if (customContent) {
          this.onSave()
        } else {
          this.handleSave()
        }
      }
    }

    buttons.appendChild(cancelButton)
    buttons.appendChild(saveButton)

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

    // Добавляем обработчик клавиши Escape для закрытия
    const escHandler = (e) => {
      if (e.key === "Escape") {
        this.close()
        document.removeEventListener("keydown", escHandler)
      }
    }
    document.addEventListener("keydown", escHandler)
  }

  createInputGroup(id, label, value) {
    const group = document.createElement("div")
    group.className = "modal-input-group"

    const labelElement = document.createElement("label")
    labelElement.htmlFor = id
    labelElement.textContent = label
    labelElement.dataset.translate = `LABELS.${id.toUpperCase()}`

    const input = document.createElement("input")
    input.id = id
    input.type = id === "url" ? "url" : "text"
    input.value = value
    input.autocomplete = "off" // Отключаем автозаполнение для лучшего UX

    // Добавляем подсветку при фокусе
    input.addEventListener("focus", () => {
      group.classList.add("focused")
    })

    input.addEventListener("blur", () => {
      group.classList.remove("focused")
    })

    group.appendChild(labelElement)
    group.appendChild(input)

    return group
  }

  handleSave() {
    const data = {}

    // Используем сохраненные ссылки на поля ввода
    if (this.type === "link") {
      data.title = this.inputs.name?.value?.trim() || ""
      data.url = this.inputs.url?.value?.trim() || ""

      // Валидация данных перед отправкой
      if (!data.title) {
        alert(i18n.t("VALIDATIONS.EMPTY_BOOKMARK_NAME"))
        if (this.inputs.name) {
          this.inputs.name.focus()
        }
        return
      }

      // Если URL пустой, добавляем протокол по умолчанию
      if (data.url && !data.url.match(/^https?:\/\//i)) {
        data.url = `https://${data.url}`
      }
    } else if (this.type === "folder") {
      data.title = this.inputs.name?.value?.trim() || ""

      // Валидация данных перед отправкой
      if (!data.title) {
        alert(i18n.t("VALIDATIONS.EMPTY_FOLDER_NAME"))
        if (this.inputs.name) {
          this.inputs.name.focus()
        }
        return
      }
    }

    if (this.onSave) {
      // Создаем копию данных, чтобы избежать изменений оригинала
      this.onSave({ ...data })
    }
  }

  close() {
    if (this.overlay) {
      document.body.removeChild(this.overlay)
      this.overlay = null
      this.modal = null
      this.inputs = {} // Очищаем кэш полей ввода
      this.onSave = null
      this.onClose = null
    }
  }

  show(title, type, initialData = {}, onSave, onClose, customContent = null) {
    this.onSave = onSave
    this.onClose = onClose
    this.create(title, type, initialData, customContent)
  }
}
