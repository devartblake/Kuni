const {BrowserWindow} = require('electron')
const EventEmitter = require('events')
const settingStore = require('../stores/settingStore')
const path = require('path')
const KuniWindowLocationSaver = require('./KuniWindowLocationSaver')
const {
  TraySettings: { SUPPORTS_TRAY_MINIMIZE_CONFIG }
} = require('../../shared/Models/Settings')
const {
  WINDOW_FIND_START,
  WINDOW_FIND_NEXT,
  WINDOW_ZOOM_IN,
  WINDOW_ZOOM_OUT,
  WINDOW_ZOOM_RESET,
  PING_RESOURCE_USAGE
} = require('../../shared/ipcEvents')

class KuniWindow extends EventEmitter {
  /* ****************************************************************************/
  // Lifecycle
  /* ****************************************************************************/

  /**
  * @param windowId = undefined: the id of the window
  */
  constructor (windowId = undefined) {
    super()
    this.windowId = windowId
    this.ownerId = null
    this.window = null
    this.locationSaver = new KuniWindowLocationSaver(windowId)

    this.boundUpdateWindowMenubar = this.updateWindowMenubar.bind(this)
  }

  /**
  * The default window preferences
  * @return the settings
  */
  defaultBrowserWindowPreferences () {
    let icon
    if (process.platform === 'win32') {
      icon = path.join(__dirname, '/../../../icons/app.ico')
    } else if (process.platform === 'linux') {
      icon = path.join(__dirname, '/../../../icons/app.png')
    }

    return {
      title: 'Kuni',
      icon: icon
    }
  }

  /* ****************************************************************************/
  // Window lifecycle
  /* ****************************************************************************/

  /**
  * Starts the app
  * @param url: the start url
  * @param browserWindowPreferences = {}: preferences to pass to the browser window
  * @return this
  */
  create (url, browserWindowPreferences = {}) {
    const savedLocation = this.locationSaver.getSavedScreenLocation()
    const fullBrowserWindowPreferences = Object.assign({},
      this.defaultBrowserWindowPreferences(),
      browserWindowPreferences,
      savedLocation
    )

    // Create the window
    this.window = new BrowserWindow(fullBrowserWindowPreferences)
    if (savedLocation.maximized && browserWindowPreferences.show !== false) {
      this.window.maximize()
    }
    this[settingStore.ui.showAppMenu ? 'showAppMenu' : 'hideAppMenu']()

    // Bind window event listeners
    this.window.on('close', (evt) => { this.emit('close', evt) })
    this.window.on('closed', (evt) => this.destroy(evt))
    this.window.on('minimize', (evt) => {
      if (SUPPORTS_TRAY_MINIMIZE_CONFIG) {
        if (settingStore.tray.show && settingStore.tray.hideWhenMinimized) {
          evt.preventDefault()
          this.window.hide()
        }
      }
    })

    // Register state savers
    this.locationSaver.register(this.window)

    // Bind other change listeners
    settingStore.on('changed', this.boundUpdateWindowMenubar)

    // Load the start url
    this.window.loadURL(url)

    return this
  }

  /**
  * Destroys the window
  * @param evt: the event that caused destroy
  */
  destroy (evt) {
    settingStore.removeListener('changed', this.boundUpdateWindowMenubar)
    if (this.window) {
      this.locationSaver.unregister(this.window)
      if (!this.window.isDestroyed()) {
        this.window.close()
        this.window.destroy()
      }
      this.window = null
    }
    this.emit('closed', evt)
  }

  /* ****************************************************************************/
  // State lifecycle
  /* ****************************************************************************/

  /**
  * Updates the menubar
  */
  updateWindowMenubar (prev, next) {
    this[settingStore.ui.showAppMenu ? 'showAppMenu' : 'hideAppMenu']()
  }

  /* ****************************************************************************/
  // Actions: Lifecycle
  /* ****************************************************************************/

  /**
  * Closes the window respecting any behaviour modifiers that are set
  * @return this
  */
  close () {
    this.window.close()
    return this
  }

  /**
  * Focuses a window
  * @return this
  */
  focus () {
    this.window.focus()
    return this
  }

  /**
  * Reloads the webview
  * @return this
  */
  reload () {
    this.window.webContents.reload()
    return this
  }

  /**
  * Navigates the content window backwards
  * @return this
  */
  navigateBack () {
    this.window.webContents.goBack()
    return this
  }

  /**
  * Navigates the content window forwards
  * @return this
  */
  navigateForward () {
    this.window.webContents.goForward()
    return this
  }

  /* ****************************************************************************/
  // Actions: Visibility
  /* ****************************************************************************/

  /**
  * Shows the window
  * @return this
  */
  show () {
    this.window.show()
    return this
  }

  /**
  * Hides the window
  * @return this
  */
  hide () {
    this.window.hide()
    return this
  }

  /**
  * Toggles fullscreen mode
  * @return this
  */
  toggleFullscreen () {
    if (this.window.isFullScreenable()) {
      this.window.setFullScreen(!this.window.isFullScreen())
    } else {
      this.window.maximize(!this.window.isMaximized())
    }
    return this
  }

  /* ****************************************************************************/
  // Actions: Dev
  /* ****************************************************************************/

  /**
  * Opens dev tools for this window
  * @return this
  */
  openDevTools () {
    this.window.webContents.openDevTools()
    return this
  }

  /**
  * Requests that the window returns resource usage
  * @return this
  */
  pingResourceUsage () {
    this.window.webContents.send(PING_RESOURCE_USAGE, { })
    return this
  }

  /* ****************************************************************************/
  // Actions: Display
  /* ****************************************************************************/

  /**
  * Show the app menu
  * @return this
  */
  showAppMenu () {
    this.window.setMenuBarVisibility(true)
    return this
  }

  /**
  * Hide the app menu
  * @return this
  */
  hideAppMenu () {
    this.window.setMenuBarVisibility(false)
    return this
  }

  /* ****************************************************************************/
  // Actions: Misc
  /* ****************************************************************************/

  /**
  * Sets the download progress
  * @param v: the download progress to set
  * @return this
  */
  setProgressBar (v) {
    this.window.setProgressBar(v)
    return this
  }

  /* ****************************************************************************/
  // Actions: Find
  /* ****************************************************************************/

  /**
  * Starts finding in the mailboxes window
  * @return this
  */
  findStart () {
    this.window.webContents.send(WINDOW_FIND_START, { })
    return this
  }

  /**
  * Finds the next in the mailbox window
  * @return this
  */
  findNext () {
    this.window.webContents.send(WINDOW_FIND_NEXT, { })
    return this
  }

  /* ****************************************************************************/
  // Actions: Zoom
  /* ****************************************************************************/

  /**
  * Zooms the current window in
  * @return this
  */
  zoomIn () {
    this.window.webContents.send(WINDOW_ZOOM_IN, { })
    return this
  }

  /**
  * Zooms the current window out
  * @return this
  */
  zoomOut () {
    this.window.webContents.send(WINDOW_ZOOM_OUT, { })
    return this
  }

  /**
  * Resets the zoom on the current window
  * @return this
  */
  zoomReset () {
    this.window.webContents.send(WINDOW_ZOOM_RESET, { })
    return this
  }

  /* ****************************************************************************/
  // Query
  /* ****************************************************************************/

  /**
  * @return true if the window is focused
  */
  isFocused () {
    return this.window.isFocused()
  }

  /**
  * @return true if the window is visible
  */
  isVisible () {
    return this.window.isVisible()
  }
}

module.exports = KuniWindow