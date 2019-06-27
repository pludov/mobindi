import * as React from 'react';
import CancellationToken from 'cancellationtoken';

import { DitheringSettings } from '@bo/BackOfficeStatus';
import TextEdit from '@src/TextEdit';

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
            <div>
                Ammount:
                <TextEdit
                        value={"" + this.props.settings.ammount}
                        onChange={(e:string)=> this.props.update({field: 'ammount', value: parseFloat(e)})}/>
            </div>
            <div>
                RA-only: <input type="checkbox"
                        checked={!!this.props.settings.raOnly}
                        onChange={(e)=>this.props.update({field: 'raOnly', value: !!e.target.checked})}/>
            </div>
            <div>
                Pixels:
                <TextEdit
                        value={"" + this.props.settings.pixels}
                        onChange={(e:string)=> this.props.update({field: 'pixels', value: parseFloat(e)})}/>
            </div>

            <div>
                Time:
                <TextEdit
                        value={"" + this.props.settings.time}
                        onChange={(e:string)=> this.props.update({field: 'time', value: parseInt(e)})}/>
            </div>
            <div>
                Timeout:
                <TextEdit
                        value={"" + this.props.settings.timeout}
                        onChange={(e:string)=> this.props.update({field: 'timeout', value: parseInt(e)})}/>
            </div>

        </div>
    }

}
