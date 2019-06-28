import * as React from 'react';
import CancellationToken from 'cancellationtoken';

import { DitheringSettings } from '@bo/BackOfficeStatus';
import TextEdit from '../TextEdit';
import Tooltip from '../Tooltip';
import "./DitheringSettingEdit.css";

type Updater<T extends keyof DitheringSettings> = {field: T, value: DitheringSettings[T]}

type Props = {
    settings: DitheringSettings;
    update: (e:Updater<any>)=>(void);
}

export default class DitheringSettingEdit extends React.PureComponent<Props, {}> {
    constructor(props:Props) {
        super(props);
    }

    render() {
        return <div>
            <h1>Dithering settings</h1>
            <div className="DitheringSettingBlock">
                <h2>Move</h2>
                <div className="DitheringSettingExplain">
                    Adjust the distance and the direction of the dithering
                </div>
                <div className="DitheringSettingParam">
                    Amount
                    <Tooltip title="Dithering>Amount">
                        A random shift of the lock position by +/- PIXELS on each of the RA and Dec axes. 
                        The value is actually multiplied by the Dither Scale value in PHD2 (Brain button).
                    </Tooltip>
                    :
                    <TextEdit
                            value={"" + this.props.settings.amount}
                            onChange={(e:string)=> this.props.update({field: 'amount', value: parseFloat(e)})}/>
                </div>
                <div className="DitheringSettingParam">
                    RA-only
                    <Tooltip>
                        If the RA-ONLY parameter is checked, or if the Dither RA Only option is set in PHD2 (brain button),
                        the dither will only be on the RA axis.
                    </Tooltip>
                    : <input type="checkbox"
                            checked={!!this.props.settings.raOnly}
                            onChange={(e)=>this.props.update({field: 'raOnly', value: !!e.target.checked})}/>
                </div>
            </div>
            <div className="DitheringSettingBlock">
                <h2>Settling</h2>

                <div className="DitheringSettingExplain">
                    Specify when PHD2 should consider guiding to be stable enough for imaging.
                </div>

                <div className="DitheringSettingParam">
                    Pixels
                    <Tooltip>
                        Maximum guide distance for guiding to be considered stable or "in-range"
                    </Tooltip>
                    :
                    <TextEdit
                            value={"" + this.props.settings.pixels}
                            onChange={(e:string)=> this.props.update({field: 'pixels', value: parseFloat(e)})}/>
                </div>

                <div className="DitheringSettingParam">
                    Time
                    <Tooltip>
                        Minimum time to be in-range before considering guiding to be stable
                    </Tooltip>
                    :
                    <TextEdit
                            value={"" + this.props.settings.time}
                            onChange={(e:string)=> this.props.update({field: 'time', value: parseInt(e)})}/>
                </div>
                <div className="DitheringSettingParam">
                    Timeout
                    <Tooltip>
                        Time limit before settling is considered to have failed
                    </Tooltip>
                    :
                    <TextEdit
                            value={"" + this.props.settings.timeout}
                            onChange={(e:string)=> this.props.update({field: 'timeout', value: parseInt(e)})}/>
                </div>
            </div>

        </div>
    }

}
