/**
 * Класс для управления навигацией по вложенным папкам
 */
export class Navigation {
  constructor() {
    this.stack = []
    this._listeners = new Set()
    console.log(
      "Инициализация Navigation: стек пуст, текущая папка = null, isRoot = true"
    )
  }

  get currentFolder() {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null
  }

  get isRoot() {
    return this.stack.length === 0
  }

  getStack() {
    return [...this.stack]
  }

  setStack(newStack) {
    console.log(
      `Navigation.setStack: установка стека: ${JSON.stringify(newStack)}`
    )
    if (Array.isArray(newStack)) {
      this.stack = [...newStack]
      console.log(`Новое состояние стека: ${JSON.stringify(this.stack)}`)
      console.log(
        `isRoot = ${this.isRoot}, currentFolder = ${JSON.stringify(
          this.currentFolder
        )}`
      )
    }
    this._notifyListeners()
  }

  push(folder) {
    console.log(
      `Navigation.push: добавление папки в стек: ${JSON.stringify(folder)}`
    )
    this.stack.push(folder)
    console.log(`Новое состояние стека: ${JSON.stringify(this.stack)}`)
    console.log(
      `isRoot = ${this.isRoot}, currentFolder = ${JSON.stringify(
        this.currentFolder
      )}`
    )
    this._notifyListeners()
  }

  pop() {
    console.log("Navigation.pop: удаление последней папки из стека")
    if (!this.isRoot) {
      this.stack.pop()

      console.log(`Новое состояние стека: ${JSON.stringify(this.stack)}`)
      this._notifyListeners()
      return true
    }
    return false
  }

  clear() {
    this.stack = []
    this._notifyListeners()
  }

  /**
   * Получает ID текущей родительской папки
   * @returns {string} - ID текущей родительской папки или "0" для корневого уровня
   */
  getCurrentParentId() {
    return this.isRoot ? "0" : this.currentFolder?.id || "0"
  }

  addListener(callback) {
    this._listeners.add(callback)
  }

  removeListener(callback) {
    this._listeners.delete(callback)
  }

  _notifyListeners() {
    for (const listener of this._listeners) {
      listener(this.currentFolder)
    }
  }
}
