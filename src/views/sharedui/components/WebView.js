import PropTypes from 'prop-types'
import React from 'react'
import ReactDOM from 'react-dom'
import {
  BROWSER_ELEVATED_LOG,
  BROWSER_ELEVATED_ERROR
} from 'shared/ipcEvents'
const electron = window.nativeRequire('electron')
const camelCase = function (name) {
  return name.split('-').map((token, index) => {
    return index === 0 ? token : (token.charAt(0).toUpperCase() + token.slice(1))
  }).join('')
}

const SEND_RESPOND_PREFIX = '__SEND_RESPOND__'
const WEBVIEW_EVENTS = [
  'load-commit',
  'did-finish-load',
  'did-fail-load',
  'did-frame-finish-load',
  'did-start-loading',
  'did-stop-loading',
  'did-get-response-details',
  'did-get-redirect-request',
  'did-navigate',
  'did-navigate-in-page',
  'dom-ready',
  'page-title-updated',
  'page-favicon-updated',
  'enter-html-full-screen',
  'leave-html-full-screen',
  'console-message',
  'new-window',
  'close',
  'ipc-message',
  'crashed',
  'gpu-crashed',
  'plugin-crashed',
  'destroyed',
  'focus',
  'blur',
  'update-target-url',
  'will-navigate',
  'did-change-theme-color'
]
const REACT_WEBVIEW_EVENTS = WEBVIEW_EVENTS.map((n) => camelCase(n))
const REACT_WEBVIEW_EVENT_PROPS = REACT_WEBVIEW_EVENTS.reduce((acc, name) => {
  acc[name] = PropTypes.func
  return acc
}, {})

const WEBVIEW_PROPS = {
  allowpopups: PropTypes.bool,
  autosize: PropTypes.bool,
  blinkfeatures: PropTypes.string,
  disableblinkfeatures: PropTypes.string,
  disableguestresize: PropTypes.bool,
  disablewebsecurity: PropTypes.bool,
  guestinstance: PropTypes.number,
  httpreferrer: PropTypes.string,
  nodeintegration: PropTypes.bool,
  partition: PropTypes.string,
  plugins: PropTypes.bool,
  preload: PropTypes.string,
  src: PropTypes.string,
  useragent: PropTypes.string,
  webpreferences: PropTypes.string
}
const WEBVIEW_ATTRS = Object.keys(WEBVIEW_PROPS)

const WEBVIEW_METHODS = [
  'blur',
  'canGoBack',
  'canGoForward',
  'canGoToOffset',
  'capturePage',
  'clearHistory',
  'copy',
  'cut',
  'delete',
  'executeJavaScript',
  'focus',
  'findInPage',
  'getURL',
  'getTitle',
  'getWebContents',
  'getUserAgent',
  'goBack',
  'goForward',
  'goToIndex',
  'goToOffset',
  'insertCSS',
  'inspectElement',
  'insertText',
  'inspectServiceWorker',
  'isAudioMuted',
  'isCrashed',
  'isDevToolsOpened',
  'isDevToolsFocused',
  'isLoading',
  'isWaitingForResponse',
  'loadURL',
  'navigateBack',
  'navigateForward',
  'openDevTools',
  'closeDevTools',
  'paste',
  'pasteAndMatchStyle',
  'redo',
  'reload',
  'reloadIgnoringCache',
  'replace',
  'replaceMisspelling',
  'print',
  'printToPDF',
  'selectAll',
  'send',
  'sendInputEvent',
  'setAudioMuted',
  'setUserAgent',
  'setZoomFactor',
  'setZoomLevel',
  'showDefinitionForSelection',
  'stop',
  'stopFindInPage',
  'undo',
  'unselect'
]

export default class WebView extends React.Component {
  /* **************************************************************************/
  // Class
  /* **************************************************************************/
  static propTypes = {
    className: PropTypes.string,
    onWebContentsAttached: PropTypes.func,
    ...WEBVIEW_PROPS,
    ...REACT_WEBVIEW_EVENT_PROPS
  }

  static REACT_WEBVIEW_EVENTS = REACT_WEBVIEW_EVENTS
  static WEBVIEW_METHODS = WEBVIEW_METHODS

  /* **************************************************************************/
  // Object lifecycle
  /* **************************************************************************/

  constructor (props) {
    super(props)

    const self = this
    WEBVIEW_METHODS.forEach((m) => {
      if (self[m] !== undefined) { return } // Allow overwriting
      this[m] = function () {
        const node = self.getWebviewNode()
        return node[m].apply(node, Array.from(arguments))
      }
    })
  }

  /* **************************************************************************/
  // Component Lifecycle
  /* **************************************************************************/

  componentDidMount () {
    this.ipcPromises = {}

    const node = this.getWebviewNode()
    WEBVIEW_EVENTS.forEach((name) => {
      node.addEventListener(name, (evt) => {
        this.dispatchWebViewEvent(name, evt)
      })
    })

    // Wait for the DOM to pain before running this
    let webContentsAttachedAttempts = 0
    this.webContentsAttachedInterval = setInterval(() => {
      webContentsAttachedAttempts++
      const webContents = node.getWebContents()
      if (webContents) {
        clearInterval(this.webContentsAttachedInterval)
        if (this.props.onWebContentsAttached) {
          this.props.onWebContentsAttached(webContents)
        }
      }

      if (webContentsAttachedAttempts > 2000) {
        clearInterval(this.webContentsAttachedInterval)
      }
    }, 1)
  }

  componentWillUnmount () {
    clearInterval(this.webContentsAttachedInterval)
  }

  componentWillReceiveProps (nextProps) {
    const changed = WEBVIEW_ATTRS.filter((name) => this.props[name] !== nextProps[name])
    if (changed.length) {
      const node = this.getWebviewNode()
      changed.forEach((name) => {
        node.setAttribute(name, nextProps[name] || '')
      })
    }
  }

  /* **************************************************************************/
  // Events
  /* **************************************************************************/

  /**
  * Dispatches a webview event to the appropriate handler
  * @param name: the name of the event
  * @param evt: the event that fired
  */
  dispatchWebViewEvent (name, evt) {
    if (this.props[camelCase(name)]) {
      if (name === 'ipc-message') {
        const didSiphon = this.siphonIPCMessage(evt)
        if (didSiphon) { return }
      }

      this.props[camelCase(name)](evt)
    }
  }

  /**
  * Siphons IPC messages
  * @param evt: the event that occured
  * @return true if the event was handled in the siphon
  */
  siphonIPCMessage (evt) {
    if (typeof (evt.channel.type) !== 'string') { return false }

    if (evt.channel.type.indexOf(SEND_RESPOND_PREFIX) === 0) {
      if (this.ipcPromises[evt.channel.type]) {
        clearTimeout(this.ipcPromises[evt.channel.type].timeout)
        this.ipcPromises[evt.channel.type].resolve(evt.channel.data)
        delete this.ipcPromises[evt.channel.type]
      }
      return true
    } else if (evt.channel.type === BROWSER_ELEVATED_LOG) {
      console.log.apply(this, ['[ELEVATED LOG]', this.getWebviewNode()].concat(evt.channel.messages))
      return true
    } else if (evt.channel.type === BROWSER_ELEVATED_ERROR) {
      console.error.apply(this, ['[ELEVATED ERROR]', this.getWebviewNode()].concat(evt.channel.messages))
      return true
    } else {
      return false
    }
  }

  /* **************************************************************************/
  // Webview calls
  /* **************************************************************************/

  /**
  * Focuses the webview, only if not in focus already
  * @return true if focused, false otherwise
  */
  focus = () => {
    const node = this.getWebviewNode()
    if (document.activeElement !== node) {
      this.getWebviewNode().focus()
      return true
    } else {
      return false
    }
  }

  /**
  * Captures a screenshot of the webview page. Includes a fix for retina display
  * not automatically getting the correct size https://github.com/electron/electron/issues/8314
  * @param [rect]: the area of the page to be captured
  * @param callback: executed on complete
  */
  capturePage = (arg1, arg2) => {
    const node = this.getWebviewNode()
    if (typeof (arg1) === 'object' && typeof (arg2) === 'function') {
      node.capturePage(arg1, arg2)
    } else {
      node.executeJavaScript(`(function () {
        return { height: window.innerHeight, width: window.innerWidth }
      })()`, (r) => {
        const scaleFactor = electron.screen.getPrimaryDisplay().scaleFactor
        const rect = {
          x: 0,
          y: 0,
          width: r.width * scaleFactor,
          height: r.height * scaleFactor
        }
        node.capturePage(rect, arg1)
      })
    }
  }

  /* **************************************************************************/
  // IPC Utils
  /* **************************************************************************/

  /**
  * Calls into the webview to get some data
  * @param sendName: the name to send to the webview
  * @param obj={}: the object to send into the webview. Note __respond__ is reserved
  * @param timeout=5000: the timeout before rejection
  * @return promise
  */
  sendWithResponse = (sendName, obj = {}, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString()
      const respondName = SEND_RESPOND_PREFIX + ':' + sendName + ':' + id
      const rejectTimeout = setTimeout(() => {
        delete this.ipcPromises[respondName]
        reject(new Error('Request Timeout'))
      }, timeout)
      this.ipcPromises[respondName] = { resolve: resolve, timeout: rejectTimeout }
      this.getWebviewNode().send(sendName, Object.assign({}, obj, { __respond__: respondName }))
    })
  }

  /* **************************************************************************/
  // Rendering
  /* **************************************************************************/

  /**
  * @return the webview node
  */
  getWebviewNode = () => {
    return ReactDOM.findDOMNode(this).getElementsByTagName('webview')[0]
  }

  shouldComponentUpdate () {
    return false // we never want to re-render. We will handle this manually in componentWillReceiveProps
  }

  render () {
    const attrs = WEBVIEW_ATTRS
      .filter((k) => this.props[k] !== undefined && this.props[k] !== false)
      .map((k) => {
        return `${k}="${this.props[k]}"`
      })
      .concat([
        'style="position:absolute; top:0; bottom:0; right:0; left:0;"'
      ])
      .join(' ')

    return (
      <div
        style={{ position: 'absolute', top: 0, bottom: 0, right: 0, left: 0 }}
        dangerouslySetInnerHTML={{__html: `<webview ${attrs}></webview>`}} />
    )
  }
}