import React from 'react';
import '../../AstrometryView.css';
import * as Store from "../../Store";
import * as AstrometryStore from "../../AstrometryStore";
import * as AccessPath from '../../shared/AccessPath';
import * as BackendAccessor from "../../utils/BackendAccessor";
import { PolarAlignSettings, PolarAlignStatus, PolarAlignPositionMessage, PolarAlignAxisSettings } from '@bo/BackOfficeStatus';
import TextEdit from '../../TextEdit';
import Modal from '../../Modal';
import PolarAlignAxisEditor from './PolarAlignAxisEditor';

type InputProps = {
    axis: "az"|"alt";
};

type MappedProps = {
    axisNames: [string, string];
    turnValue: number|null;
}

type State = {
    // 1 or -1
    forcedAxis : number|null;
    sending: number;
}

type Props = InputProps & MappedProps;

class Adjust extends React.PureComponent<Props, State> {
    accessor: BackendAccessor.RecursiveBackendAccessor<PolarAlignSettings>;
    axisEditorDialog = React.createRef<Modal>();
    constructor(props:Props) {
        super(props);
        this.accessor = AstrometryStore.astrometrySettingsAccessor().child(AccessPath.For((e)=>e.polarAlign));
        this.state = {
            forcedAxis: null,
            sending: 0,
        }
    }
    
    send = async (value:number)=>{
        await this.accessor.child(AccessPath.For((e)=>e.dyn_nextFrameCalibrationTurn)).send(value);
    }

    currentSign = ()=>{
        if (this.state.forcedAxis !== null) return this.state.forcedAxis;
        if ((this.props.turnValue !== null) && (this.props.turnValue !== 0)) {
            return this.props.turnValue > 0 ? 1 : -1;
        }
        console.log('No current sign ?');
        return 1;
    }

    setSign = async (e:React.ChangeEvent<HTMLSelectElement>)=> {
        if (!e.target.value) {
            this.axisEditorDialog.current?.open();
            return;
        }

        let axis = parseFloat(e.target.value);
        if (this.props.turnValue === null || this.props.turnValue === 0) {
            this.setState({forcedAxis: axis});
            return;
        };

        // Otherwise, direct adjust the value
        try {
            await this.send(axis * Math.abs(this.props.turnValue));
        } finally {
            this.setState({forcedAxis: null});
        }
    }

    updateValue = (value:string)=>{
        console.log("Update value:", value);
        this.send(this.currentSign() * parseFloat(value) / 360);
    }

    // Adjust state when new props are received
    static getDerivedStateFromProps(props:Props, state:State):Partial<State> {
        let ret: Partial<State> = {};
        if (state.forcedAxis !== null && props.turnValue !== null && props.turnValue !== 0) {
            state.forcedAxis = null;
        }

        return ret;
    }

    render() {
        return <>
                Movement of the screw in degree:
                <select value={this.state.forcedAxis ? this.state.forcedAxis : ((this.props.turnValue||0) >= 0 ? 1 : -1)} 
                        onChange={this.setSign}>
                    <option value="1">{this.props.axisNames[0]}</option>
                    <option value="-1">{this.props.axisNames[1]}</option>
                    <option value="">Edit axis</option>
                </select>
                <TextEdit
                    value={this.props.turnValue === null ? "" : Math.abs(360 * this.props.turnValue).toString()}
                    onChange={(e)=>this.updateValue(e)}/>°
                <Modal
                    ref={this.axisEditorDialog}
                    title={<>Edit axis</>}
                    >
                    <PolarAlignAxisEditor axis={this.props.axis}/>
                </Modal>
        </>
    }

    static mapStateToProps(store: Store.Content, props: InputProps):MappedProps {
        const axisId = props.axis;
        const polarAlign = store.backend?.astrometry?.settings?.polarAlign;
        const axis: PolarAlignAxisSettings|null = polarAlign?.[axisId] || null;
        let turnValue = polarAlign?.dyn_nextFrameCalibrationTurn;
        if (turnValue === undefined) turnValue = null;
        return {
            axisNames : axis? [axis.screwLabelStraight, axis.screwLabelReverse] : ["clockwise", "counter-clockwise"],
            turnValue,
        };
    }

};

export default Store.Connect(Adjust);