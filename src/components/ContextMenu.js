export class ContextMenu {
  constructor() {
    this.menu = null
    this.onItemClick = null

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
      if (e.key === "Escape") {
        this.close()
      }
    })
  }

  close() {
    if (this.menu && this.menu.parentNode) {
      document.body.removeChild(this.menu)
      this.menu = null
      this.onItemClick = null
    }
  }

  show(x, y, items, target, onClick) {
    // Закрываем предыдущее меню, если оно открыто
    if (this.menu) {
      this.close()
    }

    this.onItemClick = onClick
    this.menu = document.createElement("div")
    this.menu.className = "context-menu"

    items.forEach((item) => {
      const menuItem = document.createElement("div")
      menuItem.className = "context-menu-item"

      if (item.icon) {
        // Создаем иконку для светлой темы
        const iconLight = document.createElement("img")
        iconLight.src = item.icon
        iconLight.alt = ""
        iconLight.className = "context-menu-icon"
        menuItem.appendChild(iconLight)

        // Создаем иконку для темной темы, если она есть
        if (item.iconDark) {
          const iconDark = document.createElement("img")
          iconDark.src = item.iconDark
          iconDark.alt = ""
          iconDark.className = "context-menu-icon"
          menuItem.appendChild(iconDark)
        }
      }

      const text = document.createElement("span")
      text.textContent = item.text
      menuItem.appendChild(text)

      menuItem.onclick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (this.onItemClick) {
          this.onItemClick(item.action)
        }
        this.close()
      }

      this.menu.appendChild(menuItem)
    })

    document.body.appendChild(this.menu)

    // Позиционируем меню
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
  }
}
