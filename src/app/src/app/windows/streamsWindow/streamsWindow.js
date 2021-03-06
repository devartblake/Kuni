const { app, ipcMain, shell } = require('electron')
const appWindowManager = require('../../appWindowManager')
const KuniWindow = require('../KuniWindow')
const ContentWindow = require('../ContentWindow')
const ContentPopupWindow = require('../ContentPopupWindow')
const path = require('path')
const url = require('url')
const StreamsSessionManager = require('./streamsSessionManager')
const settingStore = require('../../stores/settingStore')
const userStore = require('../../stores/userStore')
const streamStore = require('../../stores/streamStore')
const CoreService = require('../../../shared/Models/Accounts/CoreService')
const {
    AuthMixer,
    AuthTwitter
} = require('../../AuthProviders')
const querystring = require('querystring')
const electron = require('electron')

const {
  STREAMS_WINDOW_PREPARE_RELOAD,
  STREAMS_WINDOW_TOGGLE_SIDEBAR,
  STREAMS_WINDOW_TOGGLE_APP_MENU,
  STREAMS_WINDOW_DOWNLOAD_COMPLETE,
  STREAMS_WINDOW_OPEN_MAILTO_LINK,
  STREAMS_WINDOW_SWITCH_STREAM,
  STREAMS_WINDOW_SWITCH_SERVICE_INDEX,
  STREAMS_WINDOW_NAVIGATE_BACK,
  STREAMS_WINDOW_NAVIGATE_FORWARD,
  STREAMS_WINDOW_SHOW_SETTINGS,
  STREAMS_WINDOW_ADD_ACCOUNT,
  STREAMS_WINDOW_STREAM_WEBVIEW_ATTACHED,
  WINDOW_EXTENSION_WEBVIEW_ATTACHED,
  STREAMS_WINDOW_FETCH_OPEN_WINDOW_COUNT,
  NEW_WINDOW,

  USER_CHECK_FOR_UPDATE,
  SQUIRREL_UPDATE_DOWNLOADED,
  SQUIRREL_UPDATE_ERROR,
  SQUIRREL_UPDATE_AVAILABLE,
  SQUIRREL_UPDATE_NOT_AVAILABLE,
  SQUIRREL_UPDATE_CHECK_START,
  SQUIRREL_UPDATE_DISABLED
} = require('../../../shared/ipcEvents')

const STREAMS_DIR = path.resolve(path.join(__dirname, '/../../../../views/streams'))
const ALLOWED_URLS = [
  'file://' + path.join(STREAMS_DIR, 'streams.html'),
  'file://' + path.join(STREAMS_DIR, 'offline.html')
]

class StreamsWindow extends KuniWindow {
  /* ****************************************************************************/
  // Lifecycle
  /* ****************************************************************************/

  constructor () {
    super('stream_window_state')
    this.authMixer = new AuthMixer()
    this.authTwitter = new AuthTwitter()
    this.sessionManager = new StreamsSessionManager(this)
    this.attachedStreams = new Map()
    this.attachedExtensions = new Map()
    this.provisionalTargetUrls = new Map()

    this.boundHandleAppWebContentsCreated = this.handleAppWebContentsCreated.bind(this)
    this.boundHandleStreamsWebViewAttached = this.handleStreamsWebViewAttached.bind(this)
    this.boundHandleExtensionWebViewAttached = this.handleExtensionWebViewAttached.bind(this)
    this.boundHandleOpenNewWindow = this.handleOpenNewWindow.bind(this)
    this.boundHandleFetchOpenWindowCount = this.handleFetchOpenWindowCount.bind(this)
  }

  /**
  * Generates the url for the window
  * @return a fully qualified url to give to the window object
  */
  generateWindowUrl () {
    const params = querystring.stringify({
      clientId: userStore.clientId,
      clientToken: userStore.clientToken
    })
    return `file://${path.join(STREAMS_DIR, 'streams.html')}?${params}`
  }

  /* ****************************************************************************/
  // Window lifecycle
  /* ****************************************************************************/

  /**
  * Starts the app
  * @param hidden=false: true to start hidden
  * @return this
  */
  create (hidden = false) {
    const screenSize = electron.screen.getPrimaryDisplay().workAreaSize
    super.create(this.generateWindowUrl(), {
      show: !hidden,
      minWidth: 770,
      minHeight: 300,
      width: Math.min(Math.max(screenSize.width, 770), 1200),
      height: Math.min(Math.max(screenSize.height, 300), 1000),
      fullscreenable: true,
      titleBarStyle: process.platform === 'darwin' && settingStore.ui.showTitlebar === false ? 'hidden' : 'default',
      frame: settingStore.ui.showTitlebar,
      title: 'Kuni',
      backgroundColor: '#f2f2f2',
      webPreferences: {
        nodeIntegration: true,
        backgroundThrottling: false,
        plugins: true
      }
    })

    app.on('web-contents-created', this.boundHandleAppWebContentsCreated)
    ipcMain.on(STREAMS_WINDOW_STREAM_WEBVIEW_ATTACHED, this.boundHandleStreamsWebViewAttached)
    ipcMain.on(WINDOW_EXTENSION_WEBVIEW_ATTACHED, this.boundHandleExtensionWebViewAttached)
    ipcMain.on(NEW_WINDOW, this.boundHandleOpenNewWindow)
    ipcMain.on(STREAMS_WINDOW_FETCH_OPEN_WINDOW_COUNT, this.boundHandleFetchOpenWindowCount)

    // We're locking on to our window. This stops file drags redirecting the page
    this.window.webContents.on('will-navigate', (evt, url) => {
      const match = ALLOWED_URLS.findIndex((allowed) => allowed.indexOf(url) === 0)
      if (!match) {
        evt.preventDefault()
      }
    })

    // We can't prevent the devtools from reloading the page so we can't get the page to teardown
    // gracefully, but if the clientId or clientToken has changed we can at least issue a redirect
    // notice to the correct url with the correct credentials :)
    this.window.webContents.on('devtools-reload-page', (evt) => {
      this.window.loadURL(this.generateWindowUrl())
    })

    return this
  }

  /**
  * Handles destroy being called
  */
  destroy (evt) {
    app.removeListener('web-contents-created', this.boundHandleAppWebContentsCreated)
    ipcMain.removeListener(STREAMS_WINDOW_STREAM_WEBVIEW_ATTACHED, this.boundHandleStreamsWebViewAttached)
    ipcMain.removeListener(WINDOW_EXTENSION_WEBVIEW_ATTACHED, this.boundHandleExtensionWebViewAttached)
    ipcMain.removeListener(NEW_WINDOW, this.boundHandleOpenNewWindow)
    ipcMain.removeListener(STREAMS_WINDOW_FETCH_OPEN_WINDOW_COUNT, this.boundHandleFetchOpenWindowCount)
    super.destroy(evt)
  }

  /* ****************************************************************************/
  // App Events
  /* ****************************************************************************/

  /**
  * Handles a new web contents being created
  * @param evt: the event that fired
  * @param contents: the webcontent that were created
  */
  handleAppWebContentsCreated (evt, contents) {
    if (contents.getType() === 'webview' && contents.hostWebContents === this.window.webContents) {
      if (settingStore.launched.app.useExperimentalWindowOpener) {
        contents.on('new-window', (evt, targetUrl, frameName, disposition, options, additionalFeatures) => {
          this.handleWebViewNewWindow(contents.id, evt, targetUrl, frameName, disposition, options, additionalFeatures)
        })
      }
      contents.on('will-navigate', (evt, url) => {
        this.handleWebViewWillNavigate(contents.id, evt, url)
      })
    }
  }

  /**
  * Handles a streams webview being attached
  * @param evt: the event that fired
  * @param data: the data that came with the event
  */
  handleStreamsWebViewAttached (evt, data) {
    if (evt.sender === this.window.webContents) {
      this.attachedStreams.set(data.webContentsId, data)
    }
  }

  /**
  * Handles an extension webview being attached
  */
  handleExtensionWebViewAttached (evt, data) {
    if (evt.sender === this.window.webContents) {
      this.attachedExtensions.set(data.webContentsId, data)
    }
  }

  /**
  * Opens a new content window
  * @param evt: the event that fired
  * @param body: the arguments from the body
  */
  handleOpenNewWindow (evt, body) {
    if (evt.sender === this.window.webContents) {
      const contentWindow = new ContentWindow()
      contentWindow.ownerId = `${body.streamId}:${body.serviceType}`
      appWindowManager.addContentWindow(contentWindow)
      contentWindow.create(this.window, body.url, body.partition, body.windowPreferences, body.webPreferences)
    }
  }

  /* ****************************************************************************/
  // Content window getters
  /* ****************************************************************************/

  /**
  * Gets the list of open windows for the specified stream and service
  * @param evt: the event that fired
  * @param body: the message sent
  */
  handleFetchOpenWindowCount (evt, body) {
    if (evt.sender === this.window.webContents) {
      const ownerId = `${body.streamId}:${body.serviceType}`
      const count = appWindowManager.getContentWindowsWithOwnerId(ownerId).length
      if (body.response) {
        evt.sender.send(body.response, { count: count })
      } else {
        evt.returnValue = { count: count }
      }
    }
  }

  /* ****************************************************************************/
  // WebView Events
  /* ****************************************************************************/

  /**
  * Handles a new window being generated from a webview
  * @param webContentsId: the id of the webcontents
  * @param evt: the event that fired
  * @param targetUrl: the webview url
  * @param frameName: the name of the frame
  * @param disposition: the frame disposition
  * @param options: the browser window options
  * @param additionalFeatures: The non-standard features
  */
  handleWebViewNewWindow (webContentsId, evt, targetUrl, frameName, disposition, options, additionalFeatures) {
    evt.preventDefault()

    // Check for some urls to never handle
    const purl = url.parse(targetUrl, true)
    if (purl.hostname === 'theorticalmindse.io' && purl.pathname.startsWith(KUNI_CAPTURE_URL_PREFIX)) { return }

    // Handle other urls
    let openMode = CoreService.WINDOW_OPEN_MODES.EXTERNAL
    let ownerId = null
    let provisionalTargetUrl

    if (this.attachedStreams.has(webContentsId)) {
      const { streamId, serviceType } = this.attachedStreams.get(webContentsId)
      ownerId = `${streamId}:${serviceType}`
      const service = streamStore.getService(streamId, serviceType)
      if (service) {
        provisionalTargetUrl = this.provisionalTargetUrls.get(ownerId)
        openMode = service.getWindowOpenModeForUrl(
          targetUrl,
          purl,
          disposition,
          provisionalTargetUrl,
          provisionalTargetUrl ? url.parse(provisionalTargetUrl, true) : undefined
        )
      }
    }

    if (openMode === CoreService.WINDOW_OPEN_MODES.POPUP_CONTENT) {
      const contentWindow = new ContentPopupWindow()
      contentWindow.ownerId = ownerId
      appWindowManager.addContentWindow(contentWindow)
      contentWindow.create(targetUrl, options)
      evt.newGuest = contentWindow.window
    } else if (openMode === CoreService.WINDOW_OPEN_MODES.EXTERNAL || openMode === CoreService.WINDOW_OPEN_MODES.DEFAULT) {
      shell.openExternal(targetUrl, {
        activate: !settingStore.os.openLinksInBackground
      })
    } else if (openMode === CoreService.WINDOW_OPEN_MODES.CONTENT || openMode === CoreService.WINDOW_OPEN_MODES.CONTENT_PROVISONAL) {
      const contentWindow = new ContentWindow()
      contentWindow.ownerId = ownerId
      appWindowManager.addContentWindow(contentWindow)
      if (openMode === CoreService.WINDOW_OPEN_MODES.CONTENT) {
        contentWindow.create(this.window, targetUrl, ((options || {}).webPreferences || {}).partition, options)
      } else if (openMode === CoreService.WINDOW_OPEN_MODES.CONTENT_PROVSIONAL) {
        contentWindow.create(this.window, provisionalTargetUrl, ((options || {}).webPreferences || {}).partition, options)
      }
    } else if (openMode === CoreService.WINDOW_OPEN_MODES.DOWNLOAD) {
      if (options.webContents) {
        options.webContents.downloadURL(targetUrl)
      }
    }
  }

  /**
  * Handles the webview navigating
  * @param webContentsId: the id of the web contents
  * @param evt: the event that fired
  * @param targetUrl: the url we're navigating to
  */
  handleWebViewWillNavigate (webContentsId, evt, targetUrl) {
    if (this.attachedExtensions.has(webContentsId)) {
      if (url.parse(targetUrl).protocol !== KUNI_HOSTED_EXTENSION_PROTOCOL + ':') {
        evt.preventDefault()
      }
    }
  }

  /* ****************************************************************************/
  // Stream Actions
  /* ****************************************************************************/

  /**
  * Reloads the webview
  * @return this
  */
  reload () {
    this.window.webContents.send(STREAMS_WINDOW_PREPARE_RELOAD, {})
    setTimeout(() => {
      this.window.loadURL(this.generateWindowUrl())
    }, 250)
    return this
  }

  /**
  * Launches the preferences modal
  * @return this
  */
  launchPreferences () {
    this.window.webContents.send(STREAMS_WINDOW_SHOW_SETTINGS, { })
    return this
  }

  /**
  * Starts the account process
  * @return this
  */
  addAccount () {
    this.window.webContents.send(STREAMS_WINDOW_ADD_ACCOUNT, { })
    return this
  }

  /**
  * Toggles the sidebar
  * @return this
  */
  toggleSidebar () {
    this.window.webContents.send(STREAMS_WINDOW_TOGGLE_SIDEBAR, { })
    return this
  }

  /**
  * Toggles the app menu
  * @return this
  */
  toggleAppMenu () {
    this.window.webContents.send(STREAMS_WINDOW_TOGGLE_APP_MENU, { })
    return this
  }

  /**
  * Tells the frame a download is complete
  * @param path: the path of the saved file
  * @param filename: the name of the file
  * @return this
  */
  downloadCompleted (path, filename) {
    this.window.webContents.send(STREAMS_WINDOW_DOWNLOAD_COMPLETE, {
      path: path,
      filename: filename
    })
    return this
  }

  /**
  * Opens a mailto link
  * @param mailtoLink: the link to open
  * @return this
  */
  openMailtoLink (mailtoLink) {
    this.window.webContents.send(STREAMS_WINDOW_OPEN_MAILTO_LINK, { mailtoLink: mailtoLink })
    return this
  }

  /* ****************************************************************************/
  // Stream Actions: Switching
  /* ****************************************************************************/

  /**
  * Switches stream
  * @param streamId: the id of the stream to switch to
  * @param serviceType=undefined: the type of service to also switch to if desired
  * @return this
  */
  switchStream (streamId, serviceType = undefined) {
    this.show().focus()
    this.window.webContents.send(STREAMS_WINDOW_SWITCH_STREAM, {
      streamId: streamId,
      serviceType: serviceType
    })
    return this
  }

  /**
  * Switches to a service at the given index. This call will fail silently if there is no
  * service at the given index
  * @param index: the index you want to switch to
  * @return this
  */
  switchToServiceAtIndex (index) {
    this.show().focus()
    this.window.webContents.send(STREAMS_STREAMS_WINDOW_SWITCH_SERVICE_INDEX, {
      index: index
    })
    return this
  }

  /**
  * Switches to the previous stream  
  * @param allowCycling=false: set to true to allow cycling at end/beginnin
  * @return this
  */
  switchPrevStream (allowCycling = false) {
    this.show().focus()
    this.window.webContents.send(STREAMS_WINDOW_SWITCH_STREAM, { prev: true, allowCycling: allowCycling })
    return this
  }

  /**
  * Switches to the next stream
  * @param allowCycling=false: set to true to allow cycling at end/begining
  * @return this
  */
  switchNextStream(allowCycling = false) {
    this.show().focus()
    this.window.webContents.send(STREAM_WINDOW_SWITCH_STREAM, { next: true, allowCycling: allowCycling })
    return this
  }

  /**
  * Tells the active stream to navigate back
  * @return this
  */
  navigateBack () {
    this.window.webContents.send(STREAM_WINDOW_NAVIGATE_BACK, { })
    return this
  }

  /**
  * Tells the active stream to navigate back
  * @return this
  */
  navigateForward () {
    this.window.webContents.send(STREAM_WINDOW_NAVIGATE_FORWARD, { })
    return this
  }

  /* ****************************************************************************/
  // Stream Actions: Update
  /* ****************************************************************************/

  /**
  * Checks for updates and keeps the UI up to date with progress
  */
  userCheckForUpdate () {
    this.window.webContents.send(USER_CHECK_FOR_UPDATE, {})
  }

  /* ****************************************************************************/
  // Stream Actions: Squirrel
  /* ****************************************************************************/

  /**
  * Indicates that the squirrel update service downloaded an update
  */
  squirrelUpdateDownloaded () {
    this.window.webContents.send(SQUIRREL_UPDATE_DOWNLOADED, { })
  }

  /**
  * Indicates that the squirrel update failed to check or fetch updates
  */
  squirrelUpdateError () {
    this.window.webContents.send(SQUIRREL_UPDATE_ERROR, { })
  }

  /**
  * Indicates that the squirrel update is available
  */
  squirrelUpdateAvailable () {
    this.window.webContents.send(SQUIRREL_UPDATE_AVAILABLE, { })
  }

  /**
  * Indicates that the squirrel update is not available
  */
  squirrelUpdateNotAvailable () {
    this.window.webContents.send(SQUIRREL_UPDATE_NOT_AVAILABLE, { })
  }

  /**
  * Indicates that squirrel is checking for updates
  */
  squirrelCheckingForUpdate () {
    this.window.webContents.send(SQUIRREL_UPDATE_CHECK_START, { })
  }

  /**
  * Indicates that squirrel updates have been disabled
  */
  squirrelUpdateDisabled () {
    this.window.webContents.send(SQUIRREL_UPDATE_DISABLED, { })
  }
}

module.exports = StreamsWindow