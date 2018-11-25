import React, { Component, PureComponent} from 'react';
import { createSelector } from 'reselect'

import { Connect } from './utils/Connect';
import * as BackOfficeStatus from '../../shared/BackOfficeStatus';

import './FitsViewerWithAstrometry.css'
import FitsViewerInContext from './FitsViewerInContext';


type InputProps = {
    app: any;
    src: string;
    contextKey: string;
};

type MappedProps = {
    visible: boolean;
    status: BackOfficeStatus.AstrometryStatus["status"];
    cancel: boolean;
    move: boolean;
    sync: boolean;
    start: boolean;
};

type Props = InputProps & MappedProps;

class FitsViewerWithAstrometry extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }

    private readonly cancel = () => {
        this.props.app.appServerRequest('astrometry', {
            method: 'cancel'
        }).start();
    }

    private readonly move = () => {
        // TODO
    }

    private readonly sync = () => {
        const syncRequest:BackOfficeStatus.AstrometrySyncScopeRequest = {
        };

        this.props.app.appServerRequest('astrometry', {
            method: 'sync',
            ...syncRequest
        }).start();
    }

    private readonly start = () => {
        const computeRequest:BackOfficeStatus.AstrometryComputeRequest = {
            image: this.props.src
        };

        this.props.app.appServerRequest('astrometry', {
            method: 'compute',
            ...computeRequest
        }).start();
    }

    private readonly contextMenuSelector = createSelector(
            [
                (m:MappedProps)=>m.start,
                (m:MappedProps)=>m.move
            ],
            (start, move)=> {
                const ret = [];
                if (start) {
                    ret.push({
                        title: 'Astrometry',
                        key: 'astrometry',
                        cb: this.start
                    });
                }
                if (move) {
                    ret.push({
                        title: 'Goto here',
                        key: 'goto',
                        cb: this.start,
                        positional: true,
                    });
                }
                return ret;
            }
    );

    titleForStatus(status:BackOfficeStatus.AstrometryStatus["status"])
    {
        return "Astrometry " + status;
    }

    render() {
        return <div className="FitsViewer FitsViewContainer">
            <FitsViewerInContext contextKey={this.props.contextKey}
                        src={this.props.src}
                        app={this.props.app}
                        contextMenu={this.contextMenuSelector(this.props)}
                />
            <span className="AstrometryImageInfoRoot">
                {this.props.visible ? this.titleForStatus(this.props.status) : null}
                {this.props.cancel ? <input type='button' value='Cancel' onClick={this.cancel}/> : null}
                {this.props.sync ? <input type='button' value='Sync Scope' onClick={this.sync}/> : null}
            </span>
        </div>;
    }

    static mapStateToProps():(store:any, ownProps: InputProps)=>MappedProps {

        const selector = createSelector (
            [(store:any)=>store.backend.astrometry, (store:any, ownProps:InputProps)=>ownProps.src],
            (astrometry:BackOfficeStatus.AstrometryStatus, src:string):MappedProps =>  {
                if (astrometry === undefined) {
                    return {
                        status: "empty",
                        visible: false,
                        cancel: false,
                        move: false,
                        sync: false,
                        start: false,
                    }
                }
                const status = astrometry.status;
                const result = {
                    status,
                    visible: true,
                    cancel: false,
                    move: false,
                    sync: false,
                    start: false,
                };
                if (status === "computing") {
                    result.cancel = true;
                } else {
                    if (astrometry.image !== null && astrometry.image === src)
                    {
                        switch(astrometry.status) {
                            case "empty":
                            case "error":
                                result.start = true;
                                break;
                            case "ready":
                                result.move = true;
                                result.sync = true;
                                break;
                            case "moving":
                            case "syncing":
                                result.cancel = true;
                                break;
                        }
                    } else {
                        result.start = true;
                        result.visible = false;
                    }
                }
                return result;
            });

        return (store:any, ownProps:InputProps)=>selector(store, ownProps);
    }
};

export default Connect<FitsViewerWithAstrometry, InputProps, {}, MappedProps>(FitsViewerWithAstrometry);
