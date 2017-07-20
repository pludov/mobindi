import React, { Component } from 'react';
import logo from './logo.svg';
import { connect } from 'react-redux';
import './App.css';

import Phd from './Phd';

import { BackendStatus } from './Store';

/** Affiche un état pendant la connection */

class App extends Component {

    render() {
        console.log('apps are : ' + JSON.stringify(this.props.apps));
        console.log('this.props.currentApp=' + this.props.currentApp);
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
                            {("phd" in this.props.apps) && this.props.apps.phd.enabled ? (<div id="phd" className={'Application' + (this.props.currentApp == "phd" ? ' Active' : '')}><img  src="guide.png"></img></div>): null}
                        </div>

                        <div className="AppMainContent">
                            {this.props.currentApp == "phd" && <Phd></Phd>}
                        </div>
                    </div>);

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
        apps: store.backend.apps,
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
