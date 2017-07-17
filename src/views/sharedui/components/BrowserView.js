import React from 'react'
import PropTypes from 'prop-types'
import WebView from './WebView'
import shallowCompare from 'react-addons-shallow-compare'

const WEBVIEW_REF = 'webview'

export default class BrowserView extends React.Component {
  /* **************************************************************************/
  // Class
  /* **************************************************************************/

  static propTypes = {
    ...WebView.propTypes,
    zoomFactor: PropTypes.number.isRequired,
    searchId: PropTypes.any.isRequired,
    searchTerm: PropTypes.string
  }
  static defaultProps = {
    zoomFactor: 1.0,
    searchId: `${Math.random()}`
  }
  static REACT_WEBVIEW_EVENTS = WebView.REACT_WEBVIEW_EVENTS
  static WEBVIEW_METHODS = [].concat(WebView.WEBVIEW_METHODS, ['getProcessMemoryInfo', 'sendWithResponse', 'getWebviewNode'])

  /* **************************************************************************/
  // Class Lifecycle
  /* **************************************************************************/

  constructor (props) {
    super(props)

    // Expose the pass-through methods
    const self = this
    this.constructor.WEBVIEW_METHODS.forEach((m) => {
      if (self[m] !== undefined) { return } // Allow overwriting
      self[m] = function () {
        return self.refs[WEBVIEW_REF][m].apply(self.refs[WEBVIEW_REF], Array.from(arguments))
      }
    })
  }

  /* **************************************************************************/
  // Browser Events
  /* **************************************************************************/

  /**
  * Until https://github.com/electron/electron/issues/6958 is fixed we need to
  * be really agressive about setting zoom levels
  */
  handleZoomFixEvent = () => {
    if (this.props.zoomFactor !== 1.0) {
      this.refs[WEBVIEW_REF].setZoomFactor(this.props.zoomFactor)
    }
  }

  /**
  * Handles the dom being ready
  */
  handleDomReady () {
    this.refs[WEBVIEW_REF].setZoomFactor(this.props.zoomFactor)
  }

  /* **************************************************************************/
  // Rendering
  /* **************************************************************************/

  shouldComponentUpdate (nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState)
  }

  componentDidUpdate (prevProps, prevState) {
    // Push state down into webview on update
    const { searchTerm, searchId, zoomFactor } = this.props

    // Zoom
    if (prevProps.zoomFactor !== zoomFactor) {
      this.refs[WEBVIEW_REF].setZoomFactor(zoomFactor)
    }

    // Search
    if (prevProps.searchTerm !== searchTerm) {
      if (searchTerm && searchTerm.length) {
        this.refs[WEBVIEW_REF].findInPage(searchTerm)
      } else {
        this.refs[WEBVIEW_REF].stopFindInPage('clearSelection')
      }
    } else if (prevProps.searchId !== searchId) {
      if (searchTerm && searchTerm.length) {
        this.refs[WEBVIEW_REF].findInPage(searchTerm, { findNext: true })
      }
    }
  }

  render () {
    const {
      domReady,
      loadCommit,
      didGetResponseDetails,
      willNavigate,
      didNavigate,
      didNavigateInPage,
      ...passProps
    } = this.props

    return (
      <WebView
        {...passProps}
        ref={WEBVIEW_REF}
        domReady={(evt) => {
          this.handleDomReady()
          if (domReady) { domReady(evt) }
        }}
        loadCommit={(evt) => {
          this.handleZoomFixEvent()
          if (loadCommit) { loadCommit(evt) }
        }}
        didGetResponseDetails={(evt) => {
          this.handleZoomFixEvent()
          if (didGetResponseDetails) { didGetResponseDetails(evt) }
        }}
        willNavigate={(evt) => {
          this.handleZoomFixEvent()
          if (willNavigate) { willNavigate(evt) }
        }}
        didNavigate={(evt) => {
          this.handleZoomFixEvent()
          if (didNavigate) { didNavigate(evt) }
        }}
        didNavigateInPage={(evt) => {
          this.handleZoomFixEvent()
          if (didNavigateInPage) { didNavigateInPage(evt) }
        }} />
    )
  }
}