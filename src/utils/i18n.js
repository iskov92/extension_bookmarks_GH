import ruLocale from "../locales/ru.js"
import enLocale from "../locales/en.js"

class I18n {
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

  t(key) {
    const keys = key.split(".")
    let value = this.translations[this.currentLocale]

    for (const k of keys) {
      value = value?.[k]
      if (!value) break
    }

    return value || key
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
