/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component } from 'react';
import { connect } from 'react-redux';

import { notifier, BackendStatus } from './Store';


class IndiManager extends Component {
    constructor(props) {
        super(props);
    }



    render() {
        var bs = this.props.indiManager;
        if (bs == undefined || bs == null) {
            return null;
        }

        return (
            <div className="Page">
                <div className={'IndiAppState IndiAppState_' + bs.status}>{bs.status}
                </div>

                <div className="ButtonBar">
                    <input type="button" value="Guide" />
                    <input type="button" value="Stop" />
                </div>
            </div>);
    }
}


const mapStateToProps = function(store) {
    var result = {
        indiManager: store.backend.indiManager
    };
    return result;
}

export default connect(mapStateToProps)(IndiManager);