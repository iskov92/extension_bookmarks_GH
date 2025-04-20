export class Navigation {
  constructor() {
    this.stack = []
    this._listeners = new Set()
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
    this.stack = [...newStack]
    this._notifyListeners()
  }

  push(folder) {
    this.stack.push(folder)
    this._notifyListeners()
  }

  pop() {
    if (!this.isRoot) {
      this.stack.pop()
      this._notifyListeners()
      return true
    }
    return false
  }

  clear() {
    this.stack = []
    this._notifyListeners()
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
