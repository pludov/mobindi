/**
 * Created by ludovic on 18/07/17.
 */
import React, { Component } from 'react';
import { connect } from 'react-redux';

import { notifier, BackendStatus } from './Store';


// Afficher l'état de phd et permet de le controller
class Phd extends Component {
    constructor(props) {
        super(props);
        this.guide = this.guide.bind(this);

    }
    guide() {
        notifier.sendMessage({
           action: "guide"
        });
    }
    render() {
        var bs = this.props.phd;
        if (bs == undefined) {
            return null;
        }

        return (
            <div>
                <div className="TextTitle">
                    <img src="guide.png"></img>PHD Guiding
                </div>
                <div>{this.props.phd.AppState}
                </div>
                <input type="button" value="Guide" onClick={this.guide}/>
                <input type="button" value="Arreter" onClick={this.guide}/>
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