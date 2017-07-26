import React, { Component } from 'react';
import logo from './logo.svg';
import { connect } from 'react-redux';
import './App.css';

import AppIcon from './AppIcon';

import PhdApp from './PhdApp';
import IndiManagerApp from './IndiManagerApp';

import { BackendStatus } from './Store';

import { update } from './shared/Obj'

/** Affiche un état pendant la connection */


class App extends Component {

    constructor(props) {
        super(props);

        // FIXME: get a store manager ?
        this.storeManager = this.props.storeManager;

        this.storeManager.addAdjuster((state) => {
            // Assurer que l'app en cours est toujours autorisée
            if (state.backendStatus == BackendStatus.Connected &&
                state.currentApp != null &&
                ((!state.backend.apps) || (!(state.currentApp in state.backend.apps) || !state.backend.apps[state.currentApp].enabled))) {
                state = update(state, {$mergedeep: {currentApp: null}});
            }
            return state;
        });

        this.storeManager.addAdjuster((state)=> {
            // Assurer qu'on ait une app en cours si possible
            if (state.backendStatus == BackendStatus.Connected &&
                state.currentApp == null && state.backend.apps && state.backend.apps.length != 0) {

                // On prend la premiere... (FIXME: historique & co...)
                var bestApp = null;
                var bestKey = null;
                for (var key in state.backend.apps) {
                    var app = state.backend.apps[key];
                    if (bestApp == null
                        || (bestApp.position > app.position)
                        || (bestApp.position == app.position && bestKey < key)) {
                        bestApp = app;
                        bestKey = key;
                    }
                }
                state = update(state,{$mergedeep:{currentApp: bestKey}});
            }
            return state;
        });

        this.apps = [
            new PhdApp(this.storeManager),
            new IndiManagerApp(this.storeManager)
        ];


    }

    render() {
        var bs = this.props.backendStatus;
        switch (bs) {
            case BackendStatus.Idle:
            case BackendStatus.Connecting:

                return (
                    <div className="Loading">
                            <img src={logo} className="App-logo" alt="logo"/>
                            <h2>Initialisation...</h2>
                    </div>);
            case BackendStatus.Failed:
                return (
                    <div className="Loading">
                            <img src={logo} className="App-logo" alt="logo"/>
                            <h2>Backend HS {(this.props.backendStatusError ? " : " + this.props.backendStatusError : null)}</h2>
                    </div>);
            case BackendStatus.Connected:
            case BackendStatus.Paused:
                return (
                    <div className="App">
                        <div className="AppStatusBar">
                            {
                                this.apps.map((app) => <AppIcon key={app.getAppId()} appid={app.getAppId()}></AppIcon>)
                            }
                        </div>

                        <div className="AppMainContent">
                            {
                                this.apps.map((app) => (app.getAppId() == this.props.currentApp ? app.getUi() : null))
                            }
                        </div>
                    </div>);
            default:
                // C'est l'application par défaut.
                return (this.props.children || null);
        }
    }


/*    return (
      <div className="App">
        <div className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h2>Backend: {"#" + this.props.backendStatus}; Phd: {this.props.phd ? this.props.phd.AppState :""}</h2>
        </div>
        <p className="App-intro">
          To get started, edit <code>src/App.js</code> and save to reload.
        </p>
      </div>
    );
  }*/
}

const mapStateToProps = function(store) {
    var result = {
        backendStatus: store.backendStatus,
        backendStatusError: store.backendStatusError,
        apps: ('backend' in store) ? store.backend.apps : null,
        currentApp: store.currentApp
    };
    return result;
}

// FIXME: ça sert à quoi ?
const mapDispatchToProps = (dispatch) => {
    return {
        UpdateSearch: (value) => {
            dispatch({type: 'UpdateSearch', value: value});
        }
    };
}


export default connect(mapStateToProps, mapDispatchToProps)(App);
