/**
 * Created by ludovic on 18/07/17.
 */
import React, { Component } from 'react';
import { connect } from 'react-redux';


import { BackendStatus } from './Store';


// Afficher l'état de phd et permet de le controller
class Phd extends Component {
    render() {
        var bs = this.props.phd;
        if (bs == undefined) {
            return null;
        }

        return (
            <div>{this.props.phd.AppState}

            </div>);
    }
}


const mapStateToProps = function(store) {
    var result = {
        phd: store.backend.phd
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

export default connect(mapStateToProps, mapDispatchToProps)(Phd);