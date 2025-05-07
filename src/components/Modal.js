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

      // Добавляем группу для загрузки иконки, если initialData содержит folderId
      if (initialData.id) {
        const iconGroup = document.createElement("div")
        iconGroup.className = "modal-input-group icon-upload-group"

        const iconLabel = document.createElement("label")
        iconLabel.className = "icon-section-label"
        iconLabel.textContent = i18n.t("LABELS.UPLOAD_ICON")
        iconGroup.appendChild(iconLabel)

        // Элемент для предпросмотра иконки
        const iconPreview = document.createElement("div")
        iconPreview.className = "icon-preview"

        const iconImg = document.createElement("img")
        iconImg.className = "folder-icon-preview"

        // Определяем иконку в зависимости от текущей темы
        const isDarkTheme = document.body.getAttribute("data-theme") === "dark"

        // Будем получать текущую иконку из iconStorage если она есть
        import("../services/IconStorage.js").then(async ({ iconStorage }) => {
          try {
            // Получаем текущую иконку, если она есть
            await iconStorage.init()
            const iconBlob = await iconStorage.getIcon(initialData.id)
            if (iconBlob) {
              iconImg.src = URL.createObjectURL(iconBlob)
            } else {
              // Используем стандартную иконку
              iconImg.src = isDarkTheme
                ? "/assets/icons/folder_black.svg"
                : "/assets/icons/folder_white.svg"
            }
          } catch (error) {
            console.error("Ошибка при получении иконки папки:", error)
            // Используем стандартную иконку при ошибке
            iconImg.src = isDarkTheme
              ? "/assets/icons/folder_black.svg"
              : "/assets/icons/folder_white.svg"
          }
        })

        iconImg.onerror = () => {
          iconImg.src = isDarkTheme
            ? "/assets/icons/folder_black.svg"
            : "/assets/icons/folder_white.svg"
        }

        iconPreview.appendChild(iconImg)
        iconGroup.appendChild(iconPreview)

        // Контейнер для инпута загрузки файла
        const fileInputContainer = document.createElement("div")
        fileInputContainer.className = "file-input-container"

        const fileInput = document.createElement("input")
        fileInput.type = "file"
        fileInput.id = "icon-upload"
        fileInput.className = "icon-upload"
        fileInput.accept = "image/*"

        // Сохраняем ссылку на инпут файла для использования при сохранении
        this.inputs.iconFile = fileInput

        const fileLabel = document.createElement("label")
        fileLabel.className = "file-input-label"
        fileLabel.htmlFor = "icon-upload"
        fileLabel.textContent = i18n.t("LABELS.CHOOSE_FILE")

        // Обработчик события выбора файла
        fileInput.addEventListener("change", async (e) => {
          const file = e.target.files[0]
          if (file) {
            // Загружаем оптимизатор изображений при необходимости
            import("../utils/imageUtils.js")
              .then(async ({ optimizeImage }) => {
                try {
                  const optimizedImage = await optimizeImage(file)
                  iconImg.src = URL.createObjectURL(optimizedImage)
                  // Изменяем текст кнопки, чтобы показать, что файл выбран
                  fileLabel.textContent =
                    file.name.length > 15
                      ? file.name.substring(0, 12) + "..."
                      : file.name
                } catch (error) {
                  console.error("Ошибка при оптимизации изображения:", error)
                  // В случае ошибки пробуем отобразить оригинал
                  iconImg.src = URL.createObjectURL(file)
                }
              })
              .catch(() => {
                // Если модуль не найден, просто отображаем оригинал
                iconImg.src = URL.createObjectURL(file)
              })
          }
        })

        fileInputContainer.appendChild(fileInput)
        fileInputContainer.appendChild(fileLabel)
        iconGroup.appendChild(fileInputContainer)

        content.appendChild(iconGroup)
      }

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

      // Если есть выбранный файл иконки, добавляем его в данные
      if (this.inputs.iconFile && this.inputs.iconFile.files.length > 0) {
        const selectedIcon = this.inputs.iconFile.files[0]

        // Используем оптимизацию иконки и сохраняем
        if (selectedIcon) {
          data._iconFile = selectedIcon // Временно храним файл в данных
        }
      }
    }

    if (this.onSave) {
      // Проверяем, есть ли выбранная иконка для сохранения
      if (data._iconFile) {
        // Используем async IIFE для сохранения иконки
        ;(async () => {
          try {
            // Загружаем модули оптимизации и хранения
            const { optimizeImage } = await import("../utils/imageUtils.js")
            const { iconStorage } = await import("../services/IconStorage.js")

            // Оптимизируем иконку
            const optimizedIcon = await optimizeImage(data._iconFile)

            // Вызываем колбэк на сохранение с данными
            delete data._iconFile // Удаляем временный файл из данных

            // Получаем результат сохранения данных от колбека
            const result = await this.onSave({ ...data })

            // Если сохранение прошло успешно и в данных был идентификатор папки,
            // сохраняем иконку
            if (result && result.id) {
              await iconStorage.init()
              await iconStorage.saveIcon(result.id, optimizedIcon)
            }
          } catch (error) {
            console.error("Ошибка при сохранении иконки:", error)
            // Вызываем колбэк на сохранение только с данными заголовка
            delete data._iconFile
            this.onSave({ ...data })
          }
        })()
      } else {
        // Если нет выбранной иконки, просто сохраняем данные
        this.onSave({ ...data })
      }
    }
  }

  close() {
    if (this.overlay) {
      // Полностью сбрасываем все флаги перетаскивания
      window.isDragging = false
      window.preventRefreshAfterDrop = false

      // Удаляем классы перетаскивания с body
      document.body.classList.remove("dragging")
      document.body.classList.remove("dragging-active")

      // Полностью очищаем все индикаторы перетаскивания в DOM
      const dropTargets = document.querySelectorAll(
        ".drop-target, .drop-target-above, .highlight"
      )
      dropTargets.forEach((item) => {
        item.classList.remove("drop-target")
        item.classList.remove("drop-target-above")
        item.classList.remove("highlight")
      })

      // Очищаем активно перетаскиваемые элементы
      const draggingItems = document.querySelectorAll(".bookmark-item.dragging")
      draggingItems.forEach((item) => {
        item.classList.remove("dragging")
      })

      // Удаляем смещения и трансформации (жертвуем сохранностью перемещений)
      const shiftedItems = document.querySelectorAll("[data-shifted]")
      shiftedItems.forEach((item) => {
        item.removeAttribute("data-shifted")
        item.style.transform = ""
      })

      // Удаление модального окна из DOM
      document.body.removeChild(this.overlay)

      // Очистка всех ссылок и состояний
      this.overlay = null
      this.modal = null
      this.inputs = {} // Очищаем кэш полей ввода
      this.onSave = null
      this.onClose = null

      // Принудительно обновляем представление после очистки
      setTimeout(() => {
        try {
          // Генерируем событие обновления интерфейса с force:true
          const refreshEvent = new CustomEvent("refresh-view", {
            detail: { force: true },
          })
          window.dispatchEvent(refreshEvent)
        } catch (e) {
          console.error("Ошибка при генерации события обновления:", e)
        }
      }, 50)
    }
  }

  show(title, type, initialData = {}, onSave, onClose, customContent = null) {
    this.onSave = onSave
    this.onClose = onClose
    this.create(title, type, initialData, customContent)
  }
}
