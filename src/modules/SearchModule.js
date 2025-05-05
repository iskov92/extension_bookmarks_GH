/**
 * Модуль для поиска закладок, папок и заметок
 */
import { getAllBookmarks } from "../utils/bookmarks.js"
import { i18n } from "../utils/i18n.js"
import { log, logError } from "../utils/logging.js"
import { ICONS } from "../config/constants.js"

export class SearchModule {
  /**
   * Конструктор модуля поиска
   * @param {HTMLElement} container - Контейнер для отображения результатов
   * @param {Function} onResultSelect - Функция, вызываемая при выборе результата
   */
  constructor(container, onResultSelect) {
    this.container = container
    this.onResultSelect = onResultSelect || (() => {})
    this.searchInput = document.getElementById("searchInput")
    this.searchButton = document.getElementById("searchButton")
    this.searchResults = document.getElementById("searchResults")
    this.clearSearchButton = document.getElementById("clearSearchButton")
    this.searchContainer = document.getElementById("searchContainer")
    this.isSearchActive = false
    this.currentResults = []
    this.tooltipTimer = null
    this.tooltip = null

    // Сначала устанавливаем обработчики событий
    this.setupEventListeners()

    // Затем создаем элемент всплывающего окна
    this.createTooltip()

    // Добавляем обработчик события для пересоздания элемента при изменении темы
    document.addEventListener("theme-changed", () => {
      this.createTooltip()
    })
  }

  /**
   * Создает элемент всплывающего окна с путем
   */
  createTooltip() {
    // Удаляем существующий элемент, если он есть
    if (this.tooltip) {
      try {
        document.body.removeChild(this.tooltip)
      } catch (error) {
        // Игнорируем ошибку, если элемент не был найден в DOM
      }
    }

    // Создаем элемент всплывающего окна
    this.tooltip = document.createElement("div")
    this.tooltip.className = "path-tooltip"

    // Добавляем элемент в DOM
    try {
      document.body.appendChild(this.tooltip)
    } catch (error) {
      console.error("Ошибка при добавлении всплывающего окна в DOM:", error)
    }
  }

  /**
   * Настройка обработчиков событий
   */
  setupEventListeners() {
    // Обработчик открытия/закрытия поиска по кнопке
    this.searchButton.addEventListener("click", () => {
      this.toggleSearch()
    })

    // Обработчик ввода текста в поле поиска
    this.searchInput.addEventListener("input", (e) => {
      this.handleSearchInput(e.target.value)
    })

    // Обработчик клика на кнопке очистки
    this.clearSearchButton.addEventListener("click", () => {
      this.clearSearch()
    })

    // Обработчик нажатия клавиш в поле ввода
    this.searchInput.addEventListener("keydown", (e) => {
      // При нажатии Escape закрываем поиск
      if (e.key === "Escape") {
        this.closeSearch()
      }
      // При нажатии Enter выбираем первый результат
      else if (e.key === "Enter" && this.currentResults.length > 0) {
        this.selectResult(this.currentResults[0])
      }
    })

    // Закрытие результатов при клике вне поиска
    document.addEventListener("click", (e) => {
      if (
        this.isSearchActive &&
        !this.searchContainer.contains(e.target) &&
        e.target !== this.searchButton
      ) {
        this.closeSearch()
      }
    })
  }

  /**
   * Переключение состояния поиска (открыт/закрыт)
   */
  toggleSearch() {
    if (this.isSearchActive) {
      this.closeSearch()
    } else {
      this.openSearch()
    }
  }

  /**
   * Открытие поиска
   */
  openSearch() {
    this.searchContainer.classList.add("active")
    this.isSearchActive = true
    this.searchInput.focus()
  }

  /**
   * Закрытие поиска
   */
  closeSearch() {
    this.searchContainer.classList.remove("active")
    this.isSearchActive = false
    this.clearSearch()
    this.hideTooltip()
  }

  /**
   * Очистка поискового запроса и результатов
   */
  clearSearch() {
    this.searchInput.value = ""
    this.searchResults.innerHTML = ""
    this.currentResults = []
    this.searchResults.classList.remove("has-results")
  }

  /**
   * Обработка ввода в поле поиска
   * @param {string} query - Поисковый запрос
   */
  async handleSearchInput(query) {
    if (!query || query.trim() === "") {
      this.clearSearch()
      return
    }

    try {
      // Получаем все закладки
      const bookmarks = await getAllBookmarks()
      // Выполняем поиск по запросу
      const results = this.searchBookmarks(
        bookmarks,
        query.trim().toLowerCase()
      )
      this.displayResults(results)
    } catch (error) {
      logError("Ошибка при поиске закладок:", error)
    }
  }

  /**
   * Поиск по закладкам, папкам и заметкам
   * @param {Array} bookmarks - Массив закладок
   * @param {string} query - Поисковый запрос (в нижнем регистре)
   * @returns {Array} Результаты поиска
   */
  searchBookmarks(bookmarks, query) {
    const results = []
    const processItem = (item, path = []) => {
      const currentPath = [...path, item.title]

      // Проверка по заголовку
      const titleMatch = item.title && item.title.toLowerCase().includes(query)

      // Проверка по URL (для закладок)
      const urlMatch = item.url && item.url.toLowerCase().includes(query)

      // Проверка по содержимому заметки
      const contentMatch =
        item.type === "note" &&
        item.content &&
        this.stripHtmlTags(item.content).toLowerCase().includes(query)

      // Добавляем в результаты, если есть совпадение
      if (titleMatch || urlMatch || contentMatch) {
        results.push({
          id: item.id,
          title: item.title,
          url: item.url,
          type: item.type,
          path: currentPath.slice(0, -1), // Путь без текущего элемента
          matchType: urlMatch ? "url" : contentMatch ? "content" : "title",
        })
      }

      // Рекурсивно обрабатываем подпапки
      if (item.type === "folder" && item.children && item.children.length > 0) {
        item.children.forEach((child) => processItem(child, currentPath))
      }
    }

    // Обрабатываем все элементы
    bookmarks.forEach((item) => processItem(item))

    // Сортируем по релевантности: сначала заголовки, потом URL, потом содержимое
    results.sort((a, b) => {
      // Приоритет по типу совпадения
      const matchTypePriority = { title: 0, url: 1, content: 2 }
      if (matchTypePriority[a.matchType] !== matchTypePriority[b.matchType]) {
        return matchTypePriority[a.matchType] - matchTypePriority[b.matchType]
      }

      // Если тип совпадения одинаковый, сортируем по типу элемента: сначала закладки, потом папки, потом заметки
      const typePriority = { bookmark: 0, folder: 1, note: 2 }
      if (typePriority[a.type] !== typePriority[b.type]) {
        return typePriority[a.type] - typePriority[b.type]
      }

      // Если всё одинаково, сортируем по заголовку
      return a.title.localeCompare(b.title)
    })

    // Ограничиваем количество результатов
    return results.slice(0, 30)
  }

  /**
   * Удаление HTML тегов из текста для поиска в содержимом заметок
   * @param {string} html - HTML содержимое
   * @returns {string} Текст без HTML тегов
   */
  stripHtmlTags(html) {
    const tempDiv = document.createElement("div")
    tempDiv.innerHTML = html
    return tempDiv.textContent || tempDiv.innerText || ""
  }

  /**
   * Отображение результатов поиска
   * @param {Array} results - Результаты поиска
   */
  displayResults(results) {
    this.searchResults.innerHTML = ""
    this.currentResults = results

    if (results.length === 0) {
      const noResults = document.createElement("div")
      noResults.className = "no-results"
      noResults.textContent = i18n.t("SEARCH.NO_RESULTS")
      this.searchResults.appendChild(noResults)
      this.searchResults.classList.add("has-results")
      return
    }

    // Создаем элементы для каждого результата
    const resultsList = document.createElement("ul")
    resultsList.className = "results-list"

    results.forEach((result) => {
      const resultItem = document.createElement("li")
      resultItem.className = `result-item ${result.type}`
      resultItem.addEventListener("click", () => this.selectResult(result))

      // Добавляем обработчики для отображения всплывающего окна с путем
      resultItem.addEventListener("mouseenter", (e) => {
        // Скрываем предыдущее всплывающее окно, если оно было
        this.hideTooltip()
        // Показываем новое всплывающее окно
        this.showPathTooltip(e, result)
      })

      resultItem.addEventListener("mouseleave", () => {
        this.hideTooltip()
      })

      // Также добавляем обработчик на отмену всплывающего окна при клике
      resultItem.addEventListener("click", () => {
        this.hideTooltip()
      })

      // Получаем иконку в зависимости от типа и темы
      const icon = document.createElement("img")
      icon.className = "result-icon"

      if (result.type === "folder") {
        const theme = document.body.getAttribute("data-theme") || "light"
        icon.src = `/assets/icons/folder_${
          theme === "dark" ? "black" : "white"
        }.svg`
      } else if (result.type === "note") {
        const theme = document.body.getAttribute("data-theme") || "light"
        icon.src = theme === "dark" ? ICONS.NOTE.DARK : ICONS.NOTE.LIGHT
      } else {
        // Для закладок используем URL напрямую в качестве фавикона
        if (result.url) {
          icon.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
            new URL(result.url).hostname
          )}&sz=32`
          icon.onerror = () => {
            icon.src = ICONS.LINK
          }
        } else {
          icon.src = ICONS.LINK
        }
      }

      // Создаем контейнер для текста результата
      const textContainer = document.createElement("div")
      textContainer.className = "result-text"

      // Заголовок результата
      const title = document.createElement("div")
      title.className = "result-title"
      title.textContent = result.title

      // Дополнительная информация о результате
      const details = document.createElement("div")
      details.className = "result-details"

      // В details показываем URL для закладок или информацию о совпадении для заметок
      if (result.url) {
        details.textContent = result.url
      } else if (result.matchType === "content") {
        details.textContent = i18n.t("SEARCH.MATCH_IN_CONTENT")
      }

      textContainer.appendChild(title)
      if (details.textContent) {
        textContainer.appendChild(details)
      }

      resultItem.appendChild(icon)
      resultItem.appendChild(textContainer)
      resultsList.appendChild(resultItem)
    })

    this.searchResults.appendChild(resultsList)
    this.searchResults.classList.add("has-results")
  }

  /**
   * Форматирует путь для отображения во всплывающем окне
   * @param {Array} pathArray - Массив элементов пути
   * @returns {string} Отформатированный путь
   */
  formatPathForTooltip(pathArray) {
    if (!pathArray || !Array.isArray(pathArray) || pathArray.length === 0) {
      return ""
    }

    // Если путь длинный, показываем ... в начале
    if (pathArray.length > 5) {
      return `... > ${pathArray.slice(-5).join(" > ")}`
    }

    return pathArray.join(" > ")
  }

  /**
   * Отображает всплывающее окно с путем элемента
   * @param {MouseEvent} event - Событие мыши
   * @param {Object} result - Данные о результате поиска
   */
  showPathTooltip(event, result) {
    // Сохраняем ссылку на элемент
    const targetElement = event.currentTarget

    // Отменяем предыдущий таймер, если он был установлен
    if (this.tooltipTimer) {
      clearTimeout(this.tooltipTimer)
    }

    // Устанавливаем таймер на 1.5 секунды
    this.tooltipTimer = setTimeout(() => {
      // Проверяем, что элемент все еще существует и есть путь
      if (!targetElement || !targetElement.isConnected) {
        this.hideTooltip()
        return
      }

      if (result.path && result.path.length > 0) {
        // Формируем текст для всплывающего окна
        const pathText = this.formatPathForTooltip(result.path)

        // Устанавливаем текст всплывающего окна
        this.tooltip.textContent = pathText

        try {
          // Позиционируем всплывающее окно относительно элемента
          const rect = targetElement.getBoundingClientRect()

          // Позиционируем по центру элемента по вертикали
          const top =
            rect.top + rect.height / 2 - (this.tooltip.offsetHeight / 2 || 10)

          // Располагаем всплывающее окно справа от элемента
          this.tooltip.style.left = `${rect.right + 10}px`
          this.tooltip.style.top = `${top}px`

          // Показываем всплывающее окно
          this.tooltip.classList.add("visible")
        } catch (error) {
          console.error("Ошибка при позиционировании всплывающего окна:", error)
          this.hideTooltip()
        }
      }
    }, 500) // 1.5 секунды задержки
  }

  /**
   * Скрывает всплывающее окно с путем
   */
  hideTooltip() {
    // Отменяем таймер, если он был установлен
    if (this.tooltipTimer) {
      clearTimeout(this.tooltipTimer)
      this.tooltipTimer = null
    }

    // Проверяем, что элемент tooltip существует
    if (this.tooltip) {
      // Скрываем всплывающее окно
      this.tooltip.classList.remove("visible")
    }
  }

  /**
   * Выбор результата поиска
   * @param {Object} result - Выбранный результат
   */
  selectResult(result) {
    this.hideTooltip()
    this.onResultSelect(result)
    this.closeSearch()
  }

  /**
   * Показать/скрыть контейнер поиска в зависимости от типа представления
   * @param {boolean} isMainView - Признак главного представления
   */
  toggleVisibility(isMainView) {
    if (isMainView) {
      this.searchContainer.style.display = "flex"
      this.searchButton.style.display = "flex"
    } else {
      this.closeSearch()
      this.searchContainer.style.display = "none"
      this.searchButton.style.display = "none"
    }
  }
}
