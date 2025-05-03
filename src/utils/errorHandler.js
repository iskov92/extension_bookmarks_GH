// Типы ошибок
export const ErrorType = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  COPY: "copy",
  LOAD: "load",
  NAVIGATION: "navigation",
  MOVE: "move",
  RESTORE: "restore",
  REORDER: "reorder",
}

// Сообщения об ошибках
const errorMessages = {
  [ErrorType.CREATE]: {
    bookmark: "Не удалось создать закладку",
    folder: "Не удалось создать папку",
  },
  [ErrorType.UPDATE]: {
    bookmark: "Не удалось сохранить изменения в закладке",
    folder: "Не удалось сохранить изменения в папке",
  },
  [ErrorType.DELETE]: {
    bookmark: "Не удалось удалить закладку",
    folder: "Не удалось удалить папку",
  },
  [ErrorType.COPY]: {
    bookmark: "Не удалось скопировать закладку",
    folder: "Не удалось скопировать папку",
  },
  [ErrorType.LOAD]: {
    bookmarks: "Не удалось загрузить закладки",
    interface: "Не удалось инициализировать интерфейс",
  },
  [ErrorType.NAVIGATION]: {
    folder: "Ошибка при навигации по папкам",
  },
  [ErrorType.MOVE]: {
    bookmark: "Не удалось переместить закладку",
    folder: "Не удалось переместить папку",
    cyclic: "Нельзя переместить папку в её собственную подпапку",
  },
  [ErrorType.RESTORE]: {
    bookmark: "Не удалось восстановить закладку",
    folder: "Не удалось восстановить папку",
  },
  [ErrorType.REORDER]: {
    bookmark: "Не удалось изменить порядок закладок",
    folder: "Не удалось изменить порядок папок",
    general: "Не удалось изменить порядок элементов",
  },
}

export class ErrorHandler {
  static handle(error, type, subtype = null, customMessage = null) {
    // Логируем ошибку с полным контекстом
    console.error(`Error [${type}${subtype ? ":" + subtype : ""}]:`, error)

    // Получаем сообщение об ошибке
    const message =
      customMessage ||
      (subtype ? errorMessages[type]?.[subtype] : errorMessages[type])

    // Показываем пользователю
    alert(message || "Произошла неизвестная ошибка")

    // Возвращаем false для удобства использования в try-catch блоках
    return false
  }

  static async wrapAsync(
    promise,
    type,
    subtype = null,
    customMessage = null,
    showLoading = false
  ) {
    try {
      console.log(`Выполнение операции: ${type}${subtype ? ":" + subtype : ""}`)

      // Отображаем индикатор загрузки, если нужно
      if (showLoading && window.showLoadingIndicator) {
        window.showLoadingIndicator(customMessage)
      }

      // Проверка входных данных перед выполнением операции
      if (!promise || typeof promise.then !== "function") {
        console.error("wrapAsync получил не Promise:", promise)
        throw new Error("Неверный формат Promise")
      }

      // Выполняем операцию
      const result = await promise

      // Скрываем индикатор загрузки
      if (showLoading && window.hideLoadingIndicator) {
        window.hideLoadingIndicator()
      }

      // Проверяем результат на null/undefined
      if (result === null || result === undefined) {
        console.warn(
          `Операция ${type}${subtype ? ":" + subtype : ""} вернула ${result}`
        )

        if (type === ErrorType.CREATE) {
          // В случае создания элементов показываем ошибку пользователю
          const error = new Error("Операция вернула пустой результат")
          return this.handle(
            error,
            type,
            subtype,
            customMessage ||
              (subtype === "folder"
                ? "Не удалось создать папку. Возможно, проблема с правами доступа или папка с таким именем уже существует."
                : "Не удалось создать закладку. Проверьте корректность URL и попробуйте снова.")
          )
        }

        // Для других типов операций не считаем null результат критичной ошибкой
        console.log(`Некритичный пустой результат для операции ${type}`)
        return result
      }

      return result
    } catch (error) {
      // Скрываем индикатор загрузки в случае ошибки
      if (showLoading && window.hideLoadingIndicator) {
        window.hideLoadingIndicator()
      }

      console.error(
        `Ошибка при выполнении операции ${type}:${subtype || ""}:`,
        error
      )

      // Добавляем дополнительную информацию об ошибке, если это возможно
      let enhancedMessage = customMessage
      if (!enhancedMessage) {
        if (error.message) {
          enhancedMessage = `${
            errorMessages[type]?.[subtype] || "Ошибка операции"
          }: ${error.message}`
        } else {
          enhancedMessage =
            errorMessages[type]?.[subtype] || "Произошла неизвестная ошибка"
        }
      }

      return this.handle(error, type, subtype, enhancedMessage)
    }
  }
}
