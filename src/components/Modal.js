export class Modal {
  constructor() {
    this.modal = null
    this.overlay = null
    this.onSave = null
    this.onClose = null
  }

  create(title, type, initialData = {}, customContent = null) {
    this.overlay = document.createElement("div")
    this.overlay.className = "modal-overlay"

    this.modal = document.createElement("div")
    this.modal.className = "modal"

    const header = document.createElement("div")
    header.className = "modal-header"
    header.textContent = title

    const content = document.createElement("div")
    content.className = "modal-content"

    if (customContent) {
      content.appendChild(customContent)
    } else if (type === "link") {
      content.appendChild(
        this.createInputGroup("name", "Название", initialData.title || "")
      )
      content.appendChild(
        this.createInputGroup("url", "URL", initialData.url || "")
      )
    } else if (type === "folder") {
      content.appendChild(
        this.createInputGroup("name", "Название папки", initialData.title || "")
      )
    }

    const buttons = document.createElement("div")
    buttons.className = "modal-buttons"

    if (!customContent) {
      const saveButton = document.createElement("button")
      saveButton.className = "modal-button primary"
      saveButton.textContent = "Сохранить"
      saveButton.onclick = () => this.handleSave(type)
      buttons.appendChild(saveButton)
    }

    const cancelButton = document.createElement("button")
    cancelButton.className = "modal-button secondary"
    cancelButton.textContent = "Отмена"
    cancelButton.onclick = () => this.close()
    buttons.appendChild(cancelButton)

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
  }

  createInputGroup(id, label, value) {
    const group = document.createElement("div")
    group.className = "modal-input-group"

    const labelElement = document.createElement("label")
    labelElement.htmlFor = id
    labelElement.textContent = label

    const input = document.createElement("input")
    input.id = id
    input.type = id === "url" ? "url" : "text"
    input.value = value

    group.appendChild(labelElement)
    group.appendChild(input)

    return group
  }

  handleSave(type) {
    const data = {}
    if (type === "link") {
      data.title = document.getElementById("name").value
      data.url = document.getElementById("url").value
    } else if (type === "folder") {
      data.title = document.getElementById("name").value
    }

    if (this.onSave) {
      this.onSave(data)
    }
    this.close()
  }

  close() {
    if (this.overlay) {
      document.body.removeChild(this.overlay)
      this.overlay = null
      this.modal = null

      if (this.onClose) {
        this.onClose()
      }
    }
  }

  show(title, type, initialData = {}, onSave, onClose, customContent = null) {
    this.onSave = onSave
    this.onClose = onClose
    this.create(title, type, initialData, customContent)
  }
}
