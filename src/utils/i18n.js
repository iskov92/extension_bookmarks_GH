import ruLocale from "../locales/ru.js"
import enLocale from "../locales/en.js"

export class I18n {
  constructor() {
    this.currentLocale = "ru"
    this.translations = {
      ru: ruLocale,
      en: enLocale,
    }
    this._listeners = new Set()
    this.initLocale()
  }

  async initLocale() {
    const { language = "ru" } = await new Promise((resolve) => {
      chrome.storage.sync.get("language", resolve)
    })
    this.currentLocale = language
  }

  async setLocale(locale) {
    this.currentLocale = locale
    await chrome.storage.sync.set({ language: locale })
    this._notifyListeners()
  }

  t(key, params = {}) {
    const keys = key.split(".")
    let value = this.translations[this.currentLocale]

    // Проходим по всем частям ключа
    for (const k of keys) {
      value = value?.[k]
      if (!value) break
    }

    if (!value) return key

    // Если есть параметры для замены, заменяем их
    if (Object.keys(params).length > 0) {
      return value.replace(/\{(\w+)\}/g, (match, param) => {
        return params[param] !== undefined ? params[param] : match
      })
    }

    return value
  }

  addListener(callback) {
    this._listeners.add(callback)
  }

  removeListener(callback) {
    this._listeners.delete(callback)
  }

  _notifyListeners() {
    for (const listener of this._listeners) {
      listener(this.currentLocale)
    }
  }
}

export const i18n = new I18n()
