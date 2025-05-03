import { i18n } from "../utils/i18n.js"

export class ContextMenu {
  constructor() {
    this.menu = null
    this.target = null
    this.onAction = null

    // Закрываем меню при клике вне его
    document.addEventListener("click", (e) => {
      if (this.menu && !this.menu.contains(e.target)) {
        this.close()
      }
    })

    // Закрываем меню при скролле
    document.addEventListener("scroll", () => {
      this.close()
    })

    // Закрываем меню при нажатии Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.menu) {
        this.close()
      }
    })
  }

  close() {
    if (this.menu) {
      document.body.removeChild(this.menu)
      this.menu = null
      this.target = null
      this.onAction = null
    }
  }

  show(x, y, items, target, onAction) {
    // Закрываем текущее меню, если оно есть
    this.close()

    // Дополнительно закрываем все контекстные меню на странице
    document.querySelectorAll(".context-menu").forEach((menu) => {
      menu.parentNode.removeChild(menu)
    })

    this.target = target
    this.onAction = onAction

    this.menu = document.createElement("div")
    this.menu.className = "context-menu"
    this.menu.style.left = `${x}px`
    this.menu.style.top = `${y}px`

    items.forEach((item) => {
      const menuItem = document.createElement("div")
      menuItem.className = "context-menu-item"
      menuItem.dataset.translate = `BUTTONS.${item.action.toUpperCase()}`

      const icon = document.createElement("img")
      const isDarkTheme = document.body.classList.contains("dark-theme")
      icon.src = isDarkTheme ? item.iconDark : item.icon
      icon.className = "context-menu-icon"
      icon.alt = i18n.t(`BUTTONS.${item.action.toUpperCase()}`)

      // Добавляем вторую иконку для другой темы
      const iconAlt = document.createElement("img")
      iconAlt.src = isDarkTheme ? item.icon : item.iconDark
      iconAlt.className = `context-menu-icon ${
        isDarkTheme ? "light-theme-icon" : "dark-theme-icon"
      }`
      iconAlt.alt = i18n.t(`BUTTONS.${item.action.toUpperCase()}`)

      const text = document.createElement("span")
      text.textContent = i18n.t(`BUTTONS.${item.action.toUpperCase()}`)
      text.className = "context-menu-text"

      menuItem.appendChild(icon)
      menuItem.appendChild(iconAlt)
      menuItem.appendChild(text)

      menuItem.addEventListener("click", () => {
        this.onAction(item.action)
        this.close()
      })

      this.menu.appendChild(menuItem)
    })

    document.body.appendChild(this.menu)

    // Проверяем, не выходит ли меню за пределы окна
    const menuRect = this.menu.getBoundingClientRect()
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight

    if (menuRect.right > windowWidth) {
      this.menu.style.left = `${windowWidth - menuRect.width}px`
    }

    if (menuRect.bottom > windowHeight) {
      this.menu.style.top = `${windowHeight - menuRect.height}px`
    }
  }
}
