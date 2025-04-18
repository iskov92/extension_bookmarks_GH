export class ContextMenu {
  constructor() {
    this.menu = null
    this.visible = false
    this.targetElement = null
    this.onAction = null
  }

  create(items) {
    this.menu = document.createElement("div")
    this.menu.className = "context-menu"

    items.forEach((item) => {
      const menuItem = document.createElement("div")
      menuItem.className = "context-menu-item"

      if (item.icon) {
        const icon = document.createElement("img")
        icon.src = item.icon
        icon.className = "context-menu-icon"
        menuItem.appendChild(icon)
      }

      const text = document.createElement("span")
      text.textContent = item.text
      menuItem.appendChild(text)

      menuItem.onclick = () => {
        if (this.onAction) {
          this.onAction(item.action, this.targetElement)
        }
        this.hide()
      }

      this.menu.appendChild(menuItem)
    })

    document.body.appendChild(this.menu)
  }

  show(x, y, items, targetElement, onAction) {
    if (this.visible) {
      this.hide()
    }

    this.targetElement = targetElement
    this.onAction = onAction
    this.create(items)

    const menuRect = this.menu.getBoundingClientRect()
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight

    // Проверяем, не выходит ли меню за пределы окна
    if (x + menuRect.width > windowWidth) {
      x = windowWidth - menuRect.width
    }

    if (y + menuRect.height > windowHeight) {
      y = windowHeight - menuRect.height
    }

    this.menu.style.left = x + "px"
    this.menu.style.top = y + "px"
    this.visible = true

    // Закрытие по клику вне меню
    setTimeout(() => {
      document.addEventListener("click", this.handleOutsideClick)
    }, 0)
  }

  handleOutsideClick = (e) => {
    if (this.menu && !this.menu.contains(e.target)) {
      this.hide()
    }
  }

  hide() {
    if (this.menu) {
      document.body.removeChild(this.menu)
      document.removeEventListener("click", this.handleOutsideClick)
      this.menu = null
      this.visible = false
      this.targetElement = null
      this.onAction = null
    }
  }
}
