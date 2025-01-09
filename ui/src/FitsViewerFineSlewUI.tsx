import React, { Component, PureComponent} from 'react';
import { createSelector } from 'reselect'

import Log from './shared/Log';
import { Connect } from './utils/Connect';
import * as BackOfficeStatus from '@bo/BackOfficeStatus';
import * as BackendRequest from "./BackendRequest";

import './FitsViewerWithAstrometry.css';
import {UnmappedFitsViewerInContext} from './FitsViewerInContext';
import * as FineSlewLogic from './shared/FineSlewLogic';
import * as Store from './Store';
import * as Help from "./Help";
import CancellationToken from 'cancellationtoken';
import ContextMenuItem from './FitsViewer/ContextMenuItem';
import FitsMarker from './FitsViewer/FitsMarker';
import "./FitsViewerFineSlewUI.css";
import { SlewDirection } from '@bo/BackOfficeAPI';
import SlewButtonController from './SlewButtonControler';
import { ContextMenuEvent } from './FitsViewer/FitsViewer';
import ScopeJoystick from './ScopeJoystick';

const logger = Log.logger(__filename);

type InputProps = {
    imagingSetup: string|null;
    isLooping: boolean;
}

type MappedProps = {
    canLearn: boolean,
    canSlew: boolean;
    slewing: boolean;
    currentLearning: BackOfficeStatus.FineSlewLearning | null;
};

type State = {
    visible: boolean;
}

type Props = InputProps & MappedProps;


type ImageLocation = {
    id: string;
    title: string;
    helpKey: Help.Key;
    slew: (imagePos: ContextMenuEvent)=>Promise<void>;
};


class FitsViewerFineSlewUI extends React.PureComponent<Props, State> {
    private static showSlewControlsHelp = Help.key("Switch slew controls", "Display buttons for scope slewing");
    private static hideSlewControlsHelp = Help.key("Hide slew controls", "Hide buttons for scope slewing");
    private static startLearningMenuHelp = Help.key("Learn fine slew", "Calibrate for precise fine movement using slew only");
    private static abortLearningMenuHelp = Help.key("Abort fine slew learning", "Discard current learning of fine slew calibration");

    private static slewToCenterHelp = Help.key("Slew to center", "Slew the selected image location to center of camera FOV");
    private static slewToTopLeftHelp = Help.key("Slew to top left", "Slew the selected image location near the top left area of the camera FOV");
    private static slewToTopRightHelp = Help.key("Slew to top right", "Slew the selected image location near the top right area of the camera FOV");
    private static slewToBottomLeftHelp = Help.key("Slew to bottom left", "Slew the selected image location near the bottom left area of the camera FOV");
    private static slewToBottomRightHelp = Help.key("Slew to bottom right", "Slew the selected image location near the bottom right area of the camera FOV");

    constructor(props:Props) {
        super(props);
        this.state = {
            visible: false
        }
    }

    locations: Array<ImageLocation> = [
        {
            id: 'center',
            title: 'center',
            helpKey : FitsViewerFineSlewUI.slewToCenterHelp,
            slew: (imagePos: ContextMenuEvent) => this.slewToPos(imagePos, {relx: 0.5, rely: 0.5} ),
        },
        {
            id: 'top-left',
            title: 'top left',
            helpKey : FitsViewerFineSlewUI.slewToTopLeftHelp,
            slew: (imagePos: ContextMenuEvent) => this.slewToPos(imagePos, {relx: 0.08, rely: 0.1} ),
        },
        {
            id: 'top-right',
            title: 'top right',
            helpKey : FitsViewerFineSlewUI.slewToTopRightHelp,
            slew: (imagePos: ContextMenuEvent) => this.slewToPos(imagePos, {relx: 0.92, rely: 0.1} ),
        },
        {
            id: 'bottom-left',
            title: 'bottom left',
            helpKey : FitsViewerFineSlewUI.slewToBottomLeftHelp,
            slew: (imagePos: ContextMenuEvent) => this.slewToPos(imagePos, {relx: 0.08, rely: 0.9} ),
        },
        {
            id: 'bottom-right',
            title: 'bottom right',
            helpKey : FitsViewerFineSlewUI.slewToBottomRightHelp,
            slew: (imagePos: ContextMenuEvent) => this.slewToPos(imagePos, {relx: 0.92, rely: 0.9} ),
        },
    ];

    private readonly cancel = async () => {
        // return await BackendRequest.RootInvoker("astrometry")("cancel")(CancellationToken.CONTINUE, {});
    }

    private readonly startLearning = async (pos: ContextMenuEvent) => {
        if (this.props.imagingSetup === null) {
            throw new Error("No imaging setup selected");
        }
        if (pos.imageWidth === undefined || pos.imageHeight === undefined
            || pos.imageX === undefined || pos.imageY === undefined) {
            throw new Error("No image position available");
        }

        return await BackendRequest.RootInvoker("astrometry")("fineSlewStartLearning")(CancellationToken.CONTINUE, {
            imagingSetup: this.props.imagingSetup,
            width: pos.imageWidth,
            height: pos.imageHeight,
            x: pos.imageX,
            y: pos.imageY,
        });
    }

    private readonly doneLearning = async () => {
        if (this.props.imagingSetup === null) {
            throw new Error("No imaging setup selected");
        }

        return await BackendRequest.RootInvoker("astrometry")("fineSlewContinueLearning")(CancellationToken.CONTINUE, {
            imagingSetup: this.props.imagingSetup,
        });

    }

    private readonly abortLearning = async () => {
        return await BackendRequest.RootInvoker("astrometry")("fineSlewAbortLearning")(CancellationToken.CONTINUE, {});
    }

    private readonly slewToPos = async (imagePos: ContextMenuEvent, target: {relx: number, rely: number}) => {
        if (this.props.imagingSetup === null) {
            throw new Error("No imaging setup selected");
        }
        if (imagePos.imageX === undefined || imagePos.imageY === undefined
            || imagePos.imageWidth === undefined || imagePos.imageHeight === undefined) {
            throw new Error("Image position not available");
        }
        return await BackendRequest.RootInvoker("astrometry")("fineSlewSendTo")(CancellationToken.CONTINUE, {
            imagingSetup: this.props.imagingSetup,
            x: imagePos.imageX,
            y: imagePos.imageY,
            width: imagePos.imageWidth,
            height: imagePos.imageHeight,
            targetX: target.relx * imagePos.imageWidth,
            targetY: target.rely * imagePos.imageHeight,
        });
    }

    private showSlewControls = ()=> {
        this.setState({ visible: true });
    }

    private hideSlewControls = ()=> {
        this.setState({ visible: false });
    }

    static getDerivedStateFromProps(newProps:Props, state:State) {
        if ((newProps.currentLearning || newProps.slewing) && !state.visible) {
            return {
                visible: true
            }
        }
        return null;
    }

    render() {

        // How to declare dynamic menu to parent ?
        // Parent can provide a context so the method
        return <>
            {!this.state.visible ?
            <>
                <ContextMenuItem
                    title={'Slew controls'}
                    uid={'Fine-slew/0000/start'}
                    helpKey={FitsViewerFineSlewUI.showSlewControlsHelp}
                    positional={false}
                    cb={this.showSlewControls}
                    />
            </>
            :
            <>
                <div className='FitsViewMarkers'>
                    {this.props.currentLearning
                        ?
                            <FitsMarker x={this.props.currentLearning.start[0]}
                                        y={this.props.currentLearning.start[1]} >
                                <div className="PhdStarLostLock"/>
                            </FitsMarker>
                        :
                            null
                    }

                    {this.props.currentLearning
                        ?
                            <FitsMarker x={this.props.currentLearning.end[0]}
                                        y={this.props.currentLearning.end[1]} >
                                <div className="PhdStarLock"/>
                            </FitsMarker>
                        :
                            null
                    }
                </div>
                <div className={"FitsViewerOverlay"}>
                    {this.props.slewing
                        ?
                            <span>Slewing...</span>
                        :
                            null
                    }
                    {this.props.currentLearning
                        ?
                            <span>Center the cliked point in the green square</span>
                        :
                            null
                    }

                    {this.props.currentLearning
                        ?
                        <>
                            <input type='button' className='RawSlewBton' value='Done' onClick={this.doneLearning}/>
                            <input type='button' className='RawSlewBton' value='Abort' onClick={this.abortLearning}/>
                        </>
                        :
                            null
                    }

                    <ScopeJoystick imagingSetup={this.props.imagingSetup}/>
                </div>

                {this.props.canSlew
                    ? this.locations.map(loc =>
                        <ContextMenuItem
                            title={'Fine slew ' + loc.title}
                            key={loc.id}
                            uid={'Fine-slew/0000/' + loc.id}
                            helpKey={loc.helpKey}
                            positional={true}
                            cb={loc.slew}/>)
                    : null
                }
                {this.props.canLearn
                    ? <ContextMenuItem
                            title='Calib. fine slew'
                            uid='Fine-slew/0001/learn'
                            helpKey={FitsViewerFineSlewUI.startLearningMenuHelp}
                            positional={true}
                            cb={this.startLearning} />
                    : null
                }
                {this.props.currentLearning !== null
                    ? <ContextMenuItem
                            title='Abort fine slew calib'
                            uid='Fine-slew/0002/abort-learning'
                            helpKey={FitsViewerFineSlewUI.abortLearningMenuHelp}
                            cb={this.abortLearning} />
                    : null
                }
                {this.props.currentLearning === null
                    ? <ContextMenuItem
                        title={'Hide slew controls'}
                        uid={'Fine-slew/0004/hide'}
                        helpKey={FitsViewerFineSlewUI.hideSlewControlsHelp}
                        positional={false}
                        cb={this.hideSlewControls}
                        />
                    : null
                }
            </>}
        </>;
    }

    static mapStateToProps():(store:any, ownProps: InputProps)=>MappedProps {

        return createSelector (
            [
                (store:Store.Content)=>store.backend?.astrometry?.fineSlew,
                (store:Store.Content, ownProps:InputProps)=>ownProps.imagingSetup,
            ],
            (status:BackOfficeStatus.FineSlewStatus, imagingSetup:string|null):MappedProps =>  {
                if (!status || !imagingSetup) {
                    return {
                        canLearn: false,
                        canSlew: false,
                        slewing: !!(status?.slewing),
                        currentLearning: null
                    };
                }

                return {
                    canLearn: FineSlewLogic.fineTuneCanLearn(status, imagingSetup),
                    slewing: status.slewing,
                    canSlew: FineSlewLogic.fineTuneCanSlew(status, imagingSetup),
                    currentLearning: FineSlewLogic.fineTuneIsLearning(status, imagingSetup),
                }
            });
    }
};

export default Connect(FitsViewerFineSlewUI);
