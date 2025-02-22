import React from 'react';
import '../../AstrometryView.css';
import * as Store from "../../Store";
import * as AstrometryStore from "../../AstrometryStore";
import * as AccessPath from '../../shared/AccessPath';
import * as BackendAccessor from "../../utils/BackendAccessor";
import { PolarAlignSettings, PolarAlignStatus, PolarAlignPositionMessage, PolarAlignAxisSettings } from '@bo/BackOfficeStatus';
import * as Help from "../../Help";
import Text from '../..//primitives/Text';

type InputProps = {
    axis: "az"|"alt";
};


class PolarAlignAxisEditor extends React.PureComponent<InputProps> {
    static screwLabelHelp = Help.key("Screw label", "Label of the screw. This is a convention with yourself");

    accessor: BackendAccessor.RecursiveBackendAccessor<PolarAlignSettings>;

    constructor(props:InputProps) {
        super(props);
        this.accessor = AstrometryStore.astrometrySettingsAccessor().child(AccessPath.For((e)=>e.polarAlign));
    }

    render() {
        let e = this.accessor.child(AccessPath.For((e)=>e[this.props.axis].screwLabelReverse));
        console.log('accessor => ', e.fromStore(Store.getStore().getState()));

        return <>
            <div className="PolarAlignExplain">
                Choose the labels for adjustment of the {this.props.axis} axis.<br/>

                If only  one screw is available, you can choose the values "clockwise" and "counter-clockwise" to differentiate the two directions.<br/>
                Otherwise, you can choose the labels of the screws (ex: east vs west).<br/>
            </div>

            <div>
                Label for the first direction:
                <Text
                    accessor={
                        this.accessor
                            .child(AccessPath.For((e)=>e[this.props.axis].screwLabelStraight))
                    }
                    helpKey={PolarAlignAxisEditor.screwLabelHelp}/>
            </div>
            <div>
                Label for the second (opposed) direction:
                <Text
                    accessor={
                        this.accessor.child(AccessPath.For((e)=>e[this.props.axis].screwLabelReverse))
                    }
                    helpKey={PolarAlignAxisEditor.screwLabelHelp}/>
            </div>

        </>
    }

};

export default PolarAlignAxisEditor;