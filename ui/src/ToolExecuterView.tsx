import * as React from 'react';
import CancellationToken from 'cancellationtoken';


import * as BackofficeStatus from '@bo/BackOfficeStatus';
import * as BackendRequest from "./BackendRequest";
import * as Store from "./Store";

import './ToolExecuterView.css'
import { InputProps } from './AppIcon';

type ToolDisplayInputProps = {
    uid:string;
}

type ToolDisplayMappedProps = {
    desc: BackofficeStatus.ToolConfig;
}

type ToolDisplayProps = ToolDisplayInputProps & ToolDisplayMappedProps;

type ToolDisplayState = {
    started: number;
    running: number;
    error: null|string;
};

class UnmappedToolDisplay extends React.PureComponent<ToolDisplayProps, ToolDisplayState> {
    constructor(props:ToolDisplayProps) {
        super(props);
        this.startConfirm = this.startConfirm.bind(this);
        this.abort = this.abort.bind(this);
        this.state = {
            started: 0,
            running: 0,
            error: null
        };
    }

    render() {
        var wantConfirm = this.props.desc.confirm;
        var mainBton, confirmArea;

        mainBton = <input type="button" value="Go..." disabled={!!this.state.running} style={{visibility: wantConfirm && this.state.started ? "hidden": "unset"}} onClick={wantConfirm ? this.startConfirm : this.start}/>;

        if (wantConfirm && this.state.started) {
            confirmArea = <div className="ToolItemConfirm">Confirm ?
                <input type="button" value="Yes" onClick={this.start}/>
                <input type="button" value="No" onClick={this.abort}/>
            </div>;
        } else {
            if (this.state.error !== null) {
                confirmArea = <div className="ToolItemError">{this.state.error}</div>;
            } else {
                confirmArea = null;
            }
        }

        return <div className="ToolItem">
            <span className="ToolTitle">{this.props.desc.desc}</span>
            {mainBton}
            {confirmArea}
        </div>;
    }

    startConfirm=()=>{
        this.setState({started: 1, error : null});
    }

    abort() {
        this.setState({started: 0});
    }

    start = async()=>{
        this.setState({running: 1, started: 0, error: null});
        try {
            await BackendRequest.RootInvoker("toolExecuter")("startTool")(CancellationToken.CONTINUE, {uid: this.props.uid});
            this.setState({running: 0});
        } catch(e) {
            this.setState({running: 0, error: "" + e});
        }
    }

    static mapStateToProps(store2:Store.Content, ownProps:ToolDisplayInputProps): ToolDisplayMappedProps {
        return {
            desc: store2.backend.toolExecuter!.tools[ownProps.uid]
        };
    }
}

const ToolDisplay = Store.Connect<UnmappedToolDisplay, ToolDisplayInputProps, {}, ToolDisplayMappedProps>(UnmappedToolDisplay);

type ToolsListInputProps = {};
type ToolsListMappedProps = {
    tools: BackofficeStatus.ToolExecuterStatus["tools"];
};
type ToolsListProps = ToolsListInputProps & ToolsListMappedProps;


class UnmappedToolsList extends React.PureComponent<ToolsListProps> {
    constructor(props:ToolsListProps) {
        super(props);
        this.state = {};
    }

    render() {
        var toolsUids = Object.keys(this.props.tools).sort();
        var content = toolsUids.map((uid)=>(
            this.props.tools[uid].hidden
                ? null
                : <ToolDisplay key={uid} uid={uid}/>
        ));
        return <div>{content}</div>;
    }

    static mapStateToProps(store: Store.Content, ownProps: ToolsListInputProps) {
        return {
            tools: store.backend.toolExecuter!.tools
        };
    }
}
const ToolsList = Store.Connect<UnmappedToolsList, ToolsListInputProps, {}, ToolsListMappedProps>(UnmappedToolsList);

export class ToolExecuterView extends React.PureComponent<{}> {
    render() {
        //var self = this;
        return(<div className="ToolView"><ToolsList/></div>);
    }
}

export default ToolExecuterView;