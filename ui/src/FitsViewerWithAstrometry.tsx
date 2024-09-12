import React, { Component, PureComponent} from 'react';
import { createSelector } from 'reselect'

import Log from './shared/Log';
import { Connect } from './utils/Connect';
import * as BackOfficeStatus from '@bo/BackOfficeStatus';
import * as BackendRequest from "./BackendRequest";

import './FitsViewerWithAstrometry.css';
import FitsViewerInContext, {UnmappedFitsViewerInContext, InputProps as FitsViewerInContextInputProps} from './FitsViewerInContext';
import {Props as FitsViewerProps, ContextMenuEntry, ContextMenuEvent} from './FitsViewer/FitsViewer';
import SkyProjection from './SkyAlgorithms/SkyProjection';
import * as Store from './Store';
import * as Help from "./Help";
import { AstrometryResult, SucceededAstrometryResult } from '@bo/ProcessorTypes';
import CancellationToken from 'cancellationtoken';
import ContextMenuItem from './FitsViewer/ContextMenuItem';
import { ImageSize } from './FitsViewer/Types';
import { getOwnProp, fallback } from './Utils';

const logger = Log.logger(__filename);

type InputProps = {
    imageUuid: string|null;
    path: string|null;
    streamId: string|null;
    streamSerial: string|null;
    subframe: FitsViewerInContextInputProps["subframe"],
    streamDetails: BackOfficeStatus.StreamDetails|null;
    autoCropCb?: FitsViewerInContextInputProps["autoCropCb"],
    contextKey: string;
};

type AstrometryProps = {
    visible: boolean;
    narrowable: boolean;
    status: BackOfficeStatus.AstrometryStatus["status"] | BackOfficeStatus.AstrometryStatus["scopeStatus"];
    error: string | null;
    scopeError:  string | null;
    cancel: boolean;
    move: boolean;
    sync: boolean;
    start: boolean;
    trackScope: string|null;
    ranow: number|null;
    decnow: number|null;

    astrometryResult: AstrometryResult | null;
};

type LiveProps = {
    scopeDeltaRa: number|null;
    scopeDeltaDec: number|null;
};

type MappedProps = AstrometryProps & LiveProps;

type Props = InputProps & MappedProps;

type State = {
    fs: boolean;
}

class FitsViewerWithAstrometry extends React.PureComponent<Props, State> {
    private readonly fitsViewer = React.createRef<UnmappedFitsViewerInContext>();

    private static fullScreenMenuHelp = Help.key("Toggle fullscreen", "Display the image using full screen (mobile) or full window (when using a desktop/laptop)");
    private static astrometryMenuHelp = Help.key("Astrometry", "Locate the coordinate of the center of the image using stars matching (astrometry.net), then sync the scope position. The search is done near the scope current position. The setting used are accessible in the Astrometry tab");
    private static astrometryWideMenuHelp = Help.key("Astrometry (wide)", "Locate the coordinate of the center of the image using stars matching (astrometry.net), then sync the scope position. The search is done through the whole visible sky area (using geo coords and current time). The setting used are accessible in the Astrometry tab");
    private static gotoMenuHelp = Help.key("Goto here", "Center the scope to the highlighted position");
    private static gotoCenterMenuHelp = Help.key("Goto center", "Center the scope to the center of the image");

    constructor(props:Props) {
        super(props);
        this.state = {fs: false};
    }

    private readonly cancel = async () => {
        return await BackendRequest.RootInvoker("astrometry")("cancel")(CancellationToken.CONTINUE, {});
    }

    private readonly getRaDecNow = (getTargetPixel : (imageSize:ImageSize)=>[number, number]) => {
        const astrometryResult = this.props.astrometryResult;

        if (!astrometryResult?.found) {
            throw new Error("No astrometry result");
        }

        const currentImageSize = this.fitsViewer.current?.fitsViewer.current?.imageDisplay?.currentImageSize();
        if (!currentImageSize || currentImageSize.width < 1 || currentImageSize.height < 1) {
            throw new Error("Invalid image");
        }

        const skyProjection = SkyProjection.fromAstrometry(astrometryResult as SucceededAstrometryResult);
        // find the target pixel in the image
        // const center = [currentImageSize.width / 2, currentImageSize.height / 2];
        const targetPixel = getTargetPixel(currentImageSize);
        // Project to J2000
        const [ra2000, dec2000] = skyProjection.pixToRaDec(targetPixel);
        // compute JNOW center for last image.
        return SkyProjection.raDecEpochFromJ2000([ra2000, dec2000], Date.now());
    }

    private readonly center = async() => {
        logger.debug('center');

        const [ranow, decnow] = this.getRaDecNow((imageSize:ImageSize)=>[imageSize.width / 2, imageSize.height / 2]);

        return await BackendRequest.RootInvoker("astrometry")("goto")(
            CancellationToken.CONTINUE,
            {
                ra: ranow,
                dec: decnow,
            }
        );

    }

    private readonly move = async (pos: ContextMenuEvent) => {
        logger.debug('move', {pos});
        const { imageX, imageY } = pos;
        if (imageX === undefined || imageY === undefined) {
            throw new Error("Wrong image position");
        }

        const [ranow, decnow] = this.getRaDecNow((imageSize:ImageSize)=>[imageX, imageY]);

        return await BackendRequest.RootInvoker("astrometry")("goto")(
            CancellationToken.CONTINUE,
            {
                ra: ranow,
                dec: decnow,
            }
        );
    }

    private readonly sync = async () => {
        logger.debug('sync');

        const [ranow, decnow] = this.getRaDecNow((imageSize:ImageSize)=>[imageSize.width / 2, imageSize.height / 2]);

        return await BackendRequest.RootInvoker("astrometry")("sync")(
            CancellationToken.CONTINUE,
            {
                ra: ranow,
                dec: decnow,
            }
        );
    }

    private readonly start=async (forceWide?:boolean)=>
    {
        if (this.props.imageUuid === null) {
            throw new Error("Astrometry not possible on stream");
        }
        return await BackendRequest.RootInvoker("astrometry")("compute")(
            CancellationToken.CONTINUE,
            {
                imageUuid: this.props.imageUuid,
                forceWide:!!forceWide
            }
        );
    }

    private readonly startNonWide = () => {
        return this.start(false);
    }

    private readonly startWide = () => {
        return this.start(true);
    }

    private readonly toggleFs = () => {
        this.setState({fs: !this.state.fs});
    }

    titleForStatus(status:BackOfficeStatus.AstrometryStatus["status"]|BackOfficeStatus.AstrometryStatus["scopeStatus"])
    {
        return "Astrometry " + status;
    }

    static deltaTitle(dlt:number) {
        if (dlt === 0) {
            return '0"';
        }

        dlt = dlt % 86400;
        if (dlt <= -86400 / 2) dlt += 86400;
        if (dlt > 86400 / 2) dlt -= 86400;

        let rslt;
        if (dlt < 0) {
            rslt = '-';
            dlt = -dlt;
        } else {
            rslt = '+';
        }

        if (dlt >= 3600) {
            rslt += Math.floor(dlt / 3600) + '°';
        }

        if (dlt >= 60 && dlt < 2*3600) {
            rslt += (Math.floor(dlt / 60) % 60) + "'";
        }

        if (dlt < 120) {
            rslt += (dlt % 60) + '"';
        }
        return rslt;
    }

    render() {
        return <div className={"FitsViewer FitsViewContainer" + (this.state.fs ? " FitsViewFullScreen" : "")}>
            <FitsViewerInContext contextKey={this.props.contextKey}
                        path={this.props.path}
                        streamId={this.props.streamId}
                        streamSerial={this.props.streamSerial}
                        streamDetails={this.props.streamDetails}
                        subframe={this.props.subframe}
                        autoCropCb={this.props.autoCropCb}
                        ref={this.fitsViewer}>

                <ContextMenuItem
                        title='Toggle fullscreen'
                        uid='Astrometry/0001/fullscreen'
                        helpKey={FitsViewerWithAstrometry.fullScreenMenuHelp}
                        cb={this.toggleFs} />

                {!this.props.start ? null :
                    this.props.narrowable
                        ?
                        <>
                            <ContextMenuItem
                                title='Astrometry'
                                uid='Astrometry/0002/astrometry'
                                helpKey={FitsViewerWithAstrometry.astrometryMenuHelp}
                                cb={this.startNonWide}/>
                            <ContextMenuItem
                                title='Astrometry (Wide)'
                                uid='Astrometry/0003/astrometry-wide'
                                helpKey={FitsViewerWithAstrometry.astrometryWideMenuHelp}
                                cb={this.startWide} />
                        </>
                        :
                            <ContextMenuItem
                                title='Astrometry (Wide)'
                                uid='Astrometry/0003/astrometry-wide'
                                helpKey={FitsViewerWithAstrometry.astrometryWideMenuHelp}
                                cb={this.startWide} />
                }
                {!this.props.move ? null :

                    <>
                        <ContextMenuItem
                            title='Goto here'
                            uid='Astrometry/0004/goto'
                            helpKey={FitsViewerWithAstrometry.gotoMenuHelp}
                            cb={this.move}
                            positional={true}/>
                        <ContextMenuItem
                            title='Goto center'
                            uid='Astrometry/0005/center'
                            helpKey={FitsViewerWithAstrometry.gotoCenterMenuHelp}
                            cb={this.center}
                            positional={false}/>

                    </>
                }

                {this.props.children}
            </FitsViewerInContext>

            <span className="AstrometryImageInfoRoot">
                {this.props.scopeDeltaRa !== null ? "Δ Ra/Dec: " + FitsViewerWithAstrometry.deltaTitle(this.props.scopeDeltaRa!) + "  " + FitsViewerWithAstrometry.deltaTitle(this.props.scopeDeltaDec!)  : null}
                {this.props.visible && this.props.scopeDeltaRa === null ? this.titleForStatus(this.props.status) : null}
                {this.props.cancel ? <input type='button' className='AstrometryBton' value='Abort' onClick={this.cancel}/> : null}
                {this.props.sync && this.props.scopeDeltaRa !== 0 && this.props.scopeDeltaDec !== 0 ? <input type='button' className='AstrometryBton' value='Sync' onClick={this.sync}/> : null}
                {this.props.error !== null
                    ? <div className="Error">{this.props.error}</div>
                    : null
                }
                {this.props.scopeError !== null
                    ? <div className="Error">{this.props.scopeError}</div>
                    : null
                }
            </span>
        </div>;
    }

    static mapStateToProps():(store:any, ownProps: InputProps)=>MappedProps {
        const selector = createSelector (
            [
                (store:Store.Content)=>store.backend.astrometry,
                (store:Store.Content, ownProps:InputProps)=>ownProps.path,
                (store:Store.Content, ownProps:InputProps)=>ownProps.imageUuid,
                (store:Store.Content, ownProps:InputProps)=>getOwnProp(store.backend.camera?.images.byuuid, ownProps.imageUuid!)?.astrometry
            ],
            (astrometry:BackOfficeStatus.AstrometryStatus, path:string|null, currentImageUuid: string|null,astrometryResult: AstrometryResult|undefined):AstrometryProps =>  {
                if (astrometry === undefined) {
                    return {
                        status: "empty",
                        visible: false,
                        narrowable: false,
                        cancel: false,
                        move: false,
                        sync: false,
                        start: false,
                        error: null,
                        trackScope: null,
                        ranow : null,
                        decnow: null,
                        astrometryResult: null,
                        scopeError: null,
                    }
                }

                const computeStatus = astrometry.status;
                const scopeStatus = astrometry.scopeStatus;
                const result: AstrometryProps = {
                    status: computeStatus,
                    narrowable: (astrometry.narrowedField !== null || astrometry.useNarrowedSearchRadius),
                    visible: true,
                    cancel: false,
                    move: false,
                    sync: false,
                    start: false,
                    error: null,
                    trackScope: null,
                    ranow: null,
                    decnow: null,
                    astrometryResult: astrometryResult || null,
                    scopeError: astrometry.scopeDetails,
                };

                // Compute the reference for scope distance
                // (This is not done in the selector because it will change often when scope will move)
                const calcTrackScope=()=>{
                    if (astrometryResult?.found ) {
                        result.trackScope = astrometry.selectedScope;

                        const skyProjection = SkyProjection.fromAstrometry(astrometryResult);
                        // take the center of the image
                        const center = [(astrometryResult.width - 1) / 2, (astrometryResult.height - 1) / 2];
                        // Project to J2000
                        const [ra2000, dec2000] = skyProjection.pixToRaDec(center);
                        // compute JNOW center for last image.
                        const [ranow, decnow] = SkyProjection.raDecEpochFromJ2000([ra2000, dec2000], Date.now());

                        result.ranow = ranow;
                        result.decnow = decnow;
                    }
                }

                const isCurrentImage = !!(currentImageUuid  && currentImageUuid === astrometry.imageUuid);

                // When something is occuring, prevent any other action, but cancel...
                if (scopeStatus === "moving" || scopeStatus === "syncing") {
                    result.cancel = true;
                    result.status = scopeStatus;
                    result.visible = false;
                    // if (isCurrentImage) {
                        result.trackScope = astrometry.selectedScope;
                        result.ranow = fallback(astrometry.target?.ra, null);
                        result.decnow = fallback(astrometry.target?.dec, null);
                    // }
                } else {
                    if (computeStatus === "computing") {
                        result.cancel = true;
                        if (!isCurrentImage) {
                            calcTrackScope();
                        }
                    } else {
                        // Don't show the status
                        result.visible = false;
                        if (currentImageUuid) {
                            if (astrometry.scopeReady) {
                                result.move = !!(astrometryResult?.found);
                                result.sync = isCurrentImage && !!(astrometryResult?.found && !astrometry.scopeMovedSinceImage);
                                result.start = !astrometryResult?.found;
                            }
                            calcTrackScope();

                            // Report error only if displaying the image from the last astrometry
                            if (isCurrentImage) {
                                if (astrometry.lastOperationError !== null) {
                                    result.error = astrometry.lastOperationError;
                                } else if (astrometry.status === "error") {
                                    result.error = "failed";
                                    result.visible = true;
                                }
                            }
                        }
                    }
                }

                return result;
            });

        return (store:Store.Content, ownProps:InputProps):MappedProps=>{
            const astrometryProps = selector(store, ownProps);
            const liveProps: LiveProps = { scopeDeltaRa:null, scopeDeltaDec:null};
            if (astrometryProps.trackScope && store.backend.indiManager) {
                try {
                    const coordNode = store.backend.indiManager?.deviceTree[astrometryProps.trackScope].EQUATORIAL_EOD_COORD;
                    const ra = 360 * parseFloat(coordNode.childs.RA.$_) / 24;
                    const dec = parseFloat(coordNode.childs.DEC.$_);

                    const deltaRa = Math.round((astrometryProps.ranow! - ra) * 3600);
                    const deltaDec = Math.round((astrometryProps.decnow! - dec) * 3600);

                    liveProps.scopeDeltaRa = deltaRa;
                    liveProps.scopeDeltaDec = deltaDec;
                } catch(e) {
                    logger.error('ignoring error', e);
                }
            }
            return {
                ...liveProps,
                ...astrometryProps
            };
        }
    }
};

export default Connect<FitsViewerWithAstrometry, InputProps, {}, MappedProps>(FitsViewerWithAstrometry);
