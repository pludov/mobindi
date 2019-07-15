import * as React from 'react';
import CancellationToken from 'cancellationtoken';

import { atPath } from "./shared/JsonPath";
import * as Store from "./Store";
import * as BackendRequest from "./BackendRequest";
import { ShootResult } from '@bo/BackOfficeAPI';

type InputProps = {
    activePath: string;
    onSuccess: (t:ShootResult)=>void;
}

type MappedProps = {
    available: false
} |
{
    available: true;
    running: false;
} |
{
    available: true;
    running: true;
    managed: boolean;
    elapsed: number;
    exposure: number;
}

type Props = InputProps & MappedProps;

class ShootBton extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }

    render() {
        var progress = 60;
        progress = this.props.available && this.props.running ? 100.0 * this.props.elapsed / this.props.exposure : 0;
        var title = !this.props.available || !this.props.running ? '' :this.props.exposure + "s";

        return <div className={'ShootBar' + (this.props.available && this.props.running ? ' ActiveShootBar' : ' InactiveShootBar')}>
            <input disabled={(!this.props.available) || this.props.running} type="button" onClick={this.shoot} className="ShootBton" value="Shoot"/>
            <input disabled={(!this.props.available) || (this.props.running && this.props.managed)} type="button" onClick={this.stream} className="ShootBton" value="Spy"/>
            <div className='ShootProgress' style={{position: 'relative'}}>
                <div style={{position: 'absolute', left: '0px', top: '0px', bottom:'0px', width: progress + '%'}}
                    className='ShootProgressAdvance'>
                </div>

                <div style={{position: 'absolute', left: '0px', right: '0px', top: '0px', bottom:'0px'}} className='ShootProgressTitle'>
                    {title}
                </div>
            </div>
            <input disabled={(!this.props.available) || !this.props.running} type="button" onClick={this.abort} className="ShootAbortBton" value="Abort"/>
        </div>;
    }

    shoot = async()=>{
        // FIXME: the button should be disabled until ack from server
        // ack from server should arrive only when state has been updated, ...
        // This looks like a progress channel is required
        const rslt = await BackendRequest.RootInvoker("camera")("shoot")(CancellationToken.CONTINUE, {});
        console.log('got rslt:' + JSON.stringify(rslt));
        this.props.onSuccess(rslt);
    }

    stream = async()=>{
        const rslt = await BackendRequest.RootInvoker("camera")("stream")(CancellationToken.CONTINUE, {});
        console.log('got rslt:' + JSON.stringify(rslt));
    }

    abort = async ()=>{
        await BackendRequest.RootInvoker("camera")("abort")(CancellationToken.CONTINUE, {});
    }

    static mapStateToProps(store:Store.Content, ownProps:InputProps):MappedProps {
        const active = atPath(store, ownProps.activePath);
        let available = false;
        if (active === undefined || active === null) {
            return {available};
        }

        // Check if exposure is present
        var deviceNode = atPath(store, '$.backend.indiManager.deviceTree[' + JSON.stringify(active) + "].CCD_EXPOSURE");
        if (deviceNode === undefined) {
            return {available}
        }
        available = true;

        const currentStream = atPath(store, '$.backend.camera.currentStreams[' + JSON.stringify(active) + "]");
        if (currentStream !== undefined) {
            return {
                available,
                running: true,
                managed: true,
                elapsed:0,
                exposure: 0,
            }
        }

        const currentShoot = atPath(store, '$.backend.camera.currentShoots[' + JSON.stringify(active) + "]");

        let running = (currentShoot != undefined);
        if (!running) {
            return {available, running}
        }

        let elapsed, exposure;

        if ('expLeft' in currentShoot) {
            elapsed = currentShoot.exposure - currentShoot.expLeft;
        } else {
            elapsed = 0;
        }
        exposure = currentShoot.exposure;

        return {
            available,
            running,
            managed: currentShoot.managed,
            elapsed,
            exposure,
        };
    }
}

export default Store.Connect(ShootBton);
