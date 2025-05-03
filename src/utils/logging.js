/**
 * Модуль для логирования сообщений в расширении
 * Включает функции для записи обычных логов, предупреждений и ошибок
 * Логирование можно отключить в продакшн-режиме, установив DEBUG_MODE в false
 */

// Флаг для включения/отключения логирования
const DEBUG_MODE = true

/**
 * Выводит информационное сообщение в консоль, если включен режим отладки
 * @param {string} message - Текст сообщения
 * @param {any} data - Дополнительные данные для логирования (опционально)
 */
export function log(message, data) {
  if (DEBUG_MODE) {
    if (data) {
      console.log(message, data)
    } else {
      console.log(message)
    }
  }
}

/**
 * Выводит сообщение об ошибке в консоль, независимо от режима отладки
 * @param {string} message - Текст сообщения
 * @param {Error|any} error - Объект ошибки или дополнительные данные
 */
export function logError(message, error) {
  if (error instanceof Error) {
    console.error(message, error.message, error.stack)
  } else if (error) {
    console.error(message, error)
  } else {
    console.error(message)
  }
}

/**
 * Выводит предупреждение в консоль, если включен режим отладки
 * @param {string} message - Текст предупреждения
 * @param {any} data - Дополнительные данные для логирования (опционально)
 */
export function logWarn(message, data) {
  if (DEBUG_MODE) {
    if (data) {
      console.warn(message, data)
    } else {
      console.warn(message)
    }
  }
}
