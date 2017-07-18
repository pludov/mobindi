import React, { Component } from 'react';
import logo from './logo.svg';
import { connect } from 'react-redux';
import './App.css';

import { BackendStatus } from './Store';

/** Affiche un état pendant la connection */

class App extends Component {
    render() {
        var bs = this.props.backendStatus;
        switch (bs) {
            case BackendStatus.Idle:
            case BackendStatus.Connecting:
                return (
                    <div className="App">
                        <div className="App-header">
                            <img src={logo} className="App-logo" alt="logo"/>
                            <h2>Initialisation...</h2>
                        </div>
                    </div>);
            case BackendStatus.Failed:
                return (
                    <div className="App">
                        <div className="App-header">
                            <img src={logo} className="App-logo" alt="logo"/>
                            <h2>Backend HS {(this.props.backendStatusError ? " : " + this.props.backendStatusError : null)}</h2>
                        </div>
                    </div>);
            case BackendStatus.Connected:
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
        backendStatusError: store.backendStatusError
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
