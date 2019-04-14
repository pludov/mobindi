import * as React from 'react';
import * as Store from './Store';
import * as Utils from './Utils';

import * as BackendRequest from "./BackendRequest";
import PromiseSelector from './PromiseSelector';
import DeviceConnectBton from './DeviceConnectBton';
import CancellationToken from 'cancellationtoken';
import { noErr } from './Utils';
import { ShootResult } from '@bo/BackOfficeAPI';
import * as BackofficeStatus from '@bo/BackOfficeStatus';


type InputProps = {
    driverId: string;
}

type MappedProps = {
    driver: BackofficeStatus.IndiDeviceConfiguration["driver"];
    details: BackofficeStatus.IndiDeviceConfiguration["options"];
}

type Props = InputProps & MappedProps;

type State = {
    runningPromise: number;
}

class IndiDriverConfig extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {runningPromise: 0};

        this.autoConnect = this.switchBoolean('autoConnect');
        this.autoGphotoSensorSize = this.switchBoolean('autoGphotoSensorSize');
    }

    static supportAutoGphotoSensorSize(driver: string) {
        return driver === 'indi_gphoto_ccd' || driver === 'indi_canon_ccd' || driver === 'indi_nikon_ccd';
    }

    private switchBoolean(key:string):(e:React.ChangeEvent<HTMLInputElement>)=>(void) {
        return (e)=>{
            const targetValue = e.target.checked;

            Utils.promiseToState(
                (async ()=> {
                    await BackendRequest.RootInvoker("indi")("updateDriverParam")(
                        CancellationToken.CONTINUE,
                        {
                            driver: this.props.driverId,
                            key: key,
                            value: targetValue
                        });
                }),
                this
            );
        }
    }

    private readonly autoConnect:(e:React.ChangeEvent<HTMLInputElement>)=>(void);
    private readonly autoGphotoSensorSize:(e:React.ChangeEvent<HTMLInputElement>)=>(void);

    render() {
        return <div>
            <div>{this.props.driverId}</div>
        
            <div className="IndiProperty">
                Auto connect:
                <input
                        type="checkbox"
                        checked={this.props.details.autoConnect ? true : false}
                        onChange={this.autoConnect}
                />
            </div>
            {IndiDriverConfig.supportAutoGphotoSensorSize(this.props.driver) ?
                <div>
                    Auto sensor size (gphoto):
                    <input
                            type="checkbox"
                            checked={this.props.details.autoGphotoSensorSize ? true : false}
                            onChange={this.autoGphotoSensorSize}
                    />
                </div>
            : null }
        </div>
    }
    static mapStateToProps (store:Store.Content, ownProps: InputProps):MappedProps {

        const result = {
            driver: Utils.noErr(()=>store.backend.indiManager!.configuration.indiServer.devices[ownProps.driverId].driver || "", ""),
            details: Utils.noErr(()=>store.backend.indiManager!.configuration.indiServer.devices[ownProps.driverId].options || {}, {})
        };
        return result;
    }
}


export default Store.Connect(IndiDriverConfig);
