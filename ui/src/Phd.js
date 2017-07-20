/**
 * Created by ludovic on 18/07/17.
 */
import React, { Component } from 'react';
import { connect } from 'react-redux';

import { notifier, BackendStatus } from './Store';

import './Phd.css';

const StatusForGuiding = ["Paused", "Looping", "Stopped", "LostLock" ];


// Afficher l'état de phd et permet de le controller
class Phd extends Component {
    constructor(props) {
        super(props);
        this.phdRequest = this.phdRequest.bind(this);

    }
    phdRequest(method) {
        return function() {
            notifier.sendMessage({
                target: 'phd',
                method: method
            });
        }
    }

    render() {
        var bs = this.props.phd;
        if (bs == undefined) {
            return null;
        }

        function formatNumber(n)
        {
            if (n == undefined || n == null) return n;
            if (typeof(n) == 'number') {
                return n.toFixed(2);
            }
            return "?" + n;
        }

        return (
            <div className="Page">
                <div className={'PHDAppState PHDAppState_' + this.props.phd.AppState}>{this.props.phd.AppState}
                </div>
                <div>SNR:{this.props.phd.star != null ? this.props.phd.star.SNR : null}</div>
                <div>
                    <table className="RADECTable">
                        <tbody>
                            <tr>
                                <td></td>
                                <td>RMS</td>
                                <td>Peak</td>
                            </tr>
                            <tr>
                                <td>RA</td>
                                <td>{formatNumber(this.props.phd.RADistanceRMS)}</td>
                                <td>{formatNumber(this.props.phd.RADistancePeak)}</td>
                            </tr>
                            <tr>
                                <td>DEC</td>
                                <td>{formatNumber(this.props.phd.DECDistanceRMS)}</td>
                                <td>{formatNumber(this.props.phd.DECDistancePeak)}</td>
                            </tr>
                            <tr>
                                <td>Total</td>
                                <td>{formatNumber(this.props.phd.RADECDistanceRMS)}</td>
                                <td>{formatNumber(this.props.phd.RADECDistancePeak)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className="ButtonBar">
                <input type="button" value="Guide" onClick={this.phdRequest('startGuide')}
                    disabled={StatusForGuiding.indexOf(bs.AppState) == -1}
                    />
                <input type="button" value="Stop" onClick={this.phdRequest('stopGuide')}
                    disabled={bs.AppState == "Stopped"}
                    />
                </div>
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