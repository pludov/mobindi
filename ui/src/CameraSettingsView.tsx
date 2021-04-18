import * as React from 'react';
import * as Store from './Store';
import { atPath } from './shared/JsonPath';
import StatePropCond from './StatePropCond';
import CameraBinEditor from './CameraBinEditor';
import CameraIsoEditor from './CameraIsoEditor';
import CameraExpEditor from './CameraExpEditor';
import './CameraView.css'
import { BackendAccessor, RecursiveBackendAccessor } from './utils/BackendAccessor';
import { CameraDeviceSettings } from '@bo/BackOfficeStatus';
import ImagingSetupSelector from './ImagingSetupSelector';

type InputProps = {
    imagingSetup: string | null;
    backendAccessor: RecursiveBackendAccessor<CameraDeviceSettings>
}
type MappedProps = {
    current: string;
}
type Props = InputProps & MappedProps;


class CameraSettingsView extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }

    setValue<K extends keyof CameraDeviceSettings>(prop:K) {
        return async (value:CameraDeviceSettings[K])=> {
            this.props.backendAccessor.prop(prop).send(value);
        };
    }

    render() {
        if (this.props.current === null) {
            return null;
        }
        const devicePath = '$.backend' + this.props.backendAccessor.getPath().map(e=>"["+JSON.stringify(e)+"]").join('');

        return <>
            <StatePropCond device={this.props.current} property="CCD_BINNING">
                    <span className='cameraSetting'>
                        <CameraBinEditor
                            device={this.props.current}
                            valuePath={devicePath + '.bin'}
                            setValue={this.setValue('bin')}/>
                    </span>
            </StatePropCond>

            <StatePropCond device={this.props.current} property="CCD_ISO">
                    <span className='cameraSetting'>
                        <CameraIsoEditor
                            device={this.props.current}
                            valuePath={devicePath + '.iso'}
                            setValue={this.setValue('iso')} />
                    </span>
            </StatePropCond>

            <StatePropCond device={this.props.current} property="CCD_EXPOSURE">
                    <span className='cameraSetting'>Exp:
                        <CameraExpEditor
                            device={this.props.current}
                            valuePath={devicePath + '.exposure'}
                            setValue={this.setValue('exposure')}/>
                    </span>
            </StatePropCond>
        </>;
    }

    static mapStateToProps = function(store: Store.Content, ownProps: InputProps) {
        return ({
            current: ImagingSetupSelector.getImagingSetup(store, ownProps.imagingSetup)?.cameraDevice
        });
    }
}

export default Store.Connect(CameraSettingsView);