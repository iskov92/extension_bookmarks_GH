// Типы ошибок
export const ErrorType = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  COPY: "copy",
  LOAD: "load",
  NAVIGATION: "navigation",
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
}

export class ErrorHandler {
  static handle(error, type, subtype = null) {
    // Логируем ошибку с полным контекстом
    console.error(`Error [${type}${subtype ? ":" + subtype : ""}]:`, error)

    // Получаем сообщение об ошибке
    const message = subtype
      ? errorMessages[type]?.[subtype]
      : errorMessages[type]

    // Показываем пользователю
    alert(message || "Произошла неизвестная ошибка")

    // Возвращаем false для удобства использования в try-catch блоках
    return false
  }

  static async wrapAsync(promise, type, subtype = null) {
    try {
      return await promise
    } catch (error) {
      return this.handle(error, type, subtype)
    }
  }
}
