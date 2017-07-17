import alt from '../alt'
import actions from './userActions'
import { ANALYTICS_ID, CREATED_TIME } from 'shared/Models/DeviceKeys'
import User from 'shared/Models/User'
import persistence from './userPersistence'
import Bootstrap from '../../bootstrap'
import CoreStream from 'shared/Models/Accounts/CoreStream'
import { AUTH_KUNI } from 'shared/ipcEvents'
const { ipcRenderer } = window.nativeRequire('electron')

class UserStore {
  /* **************************************************************************/
  // Lifecycle
  /* **************************************************************************/

  constructor () {
    this.clientId = null
    this.clientToken = null
    this.analyticsId = null
    this.createdTime = null
    this.account = null

    /* ****************************************/
    // Listeners
    /* ****************************************/

    this.bindListeners({
      // Store lifecycle
      handleLoad: actions.LOAD,

      handleRemoteChangeAccount: actions.REMOTE_CHANGE_ACCOUNT,

      handleAuthenticateWithStream: actions.AUTHENTICATE_WITH_STREAM,
      handleAuthenticateWithGoogle: actions.AUTHENTICATE_WITH_GOOGLE,
      handleAuthenticateWithMicrosoft: actions.AUTHENTICATE_WITH_MIXER,

      handleAuthenticationSuccess: actions.AUTHENTICATION_SUCCESS,
      handleAuthenticationFailure: actions.AUTHENTICATION_FAILURE
    })
  }

  /* **************************************************************************/
  // Handlers: Store Lifecycle
  /* **************************************************************************/

  handleLoad () {
    const allData = persistence.allJSONItemsSync()
    this.clientId = Bootstrap.clientToken
    this.clientToken = Bootstrap.clientToken
    this.analyticsId = allData[ANALYTICS_ID]
    this.createdTime = allData[CREATED_TIME]
    this.user = new User(Bootstrap.accountJS)
  }

  /* **************************************************************************/
  // Handlers: Account
  /* **************************************************************************/

  handleRemoteChangeAccount ({ account }) {
    this.user = new User(account)
  }

  /* **************************************************************************/
  // Handlers: Auth
  /* **************************************************************************/

  handleAuthenticateWithStream ({ id, type, serverArgs }) {
    ipcRenderer.send(AUTH_KUNI, {
      id: id,
      type: type,
      clientSecret: this.user.clientSecret,
      serverArgs: serverArgs
    })
    window.location.hash = '/account/authenticating'
  }

  handleAuthenticateWithGoogle ({ serverArgs }) {
    ipcRenderer.send(AUTH_KUNI, {
      id: null,
      type: CoreStream.STREAM_TYPES.GOOGLE,
      clientSecret: this.user.clientSecret,
      serverArgs: serverArgs
    })
    window.location.hash = '/account/authenticating'
  }

  handleAuthenticateWithMicrosoft ({ serverArgs }) {
    ipcRenderer.send(AUTH_KUNI, {
      id: null,
      type: CoreStream.STREAM_TYPES.MIXER,
      clientSecret: this.user.clientSecret,
      serverArgs: serverArgs
    })
    window.location.hash = '/account/authenticating'
  }

  /* **************************************************************************/
  // Handlers: Auth Callbacks
  /* **************************************************************************/

  handleAuthenticationSuccess ({ id, type, next }) {
    if (next) {
      window.location.hash = `/account/view?url=${next}`
    } else {
      window.location.hash = '/account/view'
    }
  }

  handleAuthenticationFailure ({ evt, data }) {
    window.location.hash = '/'
    if (data.errorMessage.toLowerCase().indexOf('user') === 0) {
      /* user cancelled. no-op */
    } else {
      console.error('[AUTH ERR]', data)
    }
  }
}

export default alt.createStore(UserStore, 'UserStore')
