import React, { Component, PureComponent} from 'react';

import Log from './shared/Log';
import * as BackendRequest from "./BackendRequest";

import './FitsViewerWithAstrometry.css';
import CancellationToken from 'cancellationtoken';
import "./FitsViewerFineSlewUI.css";
import { SlewDirection } from '@bo/BackOfficeAPI';
import SlewButtonController from './SlewButtonControler';


const logger = Log.logger(__filename);

type InputProps = {
    imagingSetup: string|null;
}


type Props = InputProps;


export default class ScopeJoystick extends React.PureComponent<Props> {
    private slewControls : {[id:string]:SlewButtonController}= {
        north: new SlewButtonController(
            ()=>this.slew("north", false),
            ()=>this.slew("north", true)
        ),
        south: new SlewButtonController(
            ()=>this.slew("south", false),
            ()=>this.slew("south", true)
        ),
        east: new SlewButtonController(
            ()=>this.slew("east", false),
            ()=>this.slew("east", true)
        ),
        west: new SlewButtonController(
            ()=>this.slew("west", false),
            ()=>this.slew("west", true)
        ),
    };

    constructor(props:Props) {
        super(props);
    }


    private readonly cancel = async () => {
        // return await BackendRequest.RootInvoker("astrometry")("cancel")(CancellationToken.CONTINUE, {});
    }

    componentWillUnmount = ()=>{
        for(const e of Object.keys(this.slewControls)) {
            this.slewControls[e].stop();
        }
    }

    private slew = async (direction: SlewDirection, release: boolean)=>{
        return await BackendRequest.RootInvoker("astrometry")("slew")(CancellationToken.CONTINUE, {
            direction,
            release,
        });
    }

    private abort = async ()=> {
        for(const e of Object.keys(this.slewControls)) {
            this.slewControls[e].interrupted();
        }
        await BackendRequest.RootInvoker("astrometry")("abortSlew")(CancellationToken.CONTINUE, {});
    }

    render() {
        return <div className="RawSlewButtonPanel">
                            <input type='button' className='RawSlewBton RawSlewNorth' value='N' {...this.slewControls.north.buttonProperties()}/>
                            <input type='button' className='RawSlewBton RawSlewSouth' value='S' {...this.slewControls.south.buttonProperties()}/>
                            <input type='button' className='RawSlewBton RawSlewEast' value='E'  {...this.slewControls.east.buttonProperties()}/>
                            <input type='button' className='RawSlewBton RawSlewWest' value='W'  {...this.slewControls.west.buttonProperties()}/>
                            <input type='button' className='RawSlewBton RawSlewAbort' value='X' onClick={this.abort}/>
                </div>;
    }
};
