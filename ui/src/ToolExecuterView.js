import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';


import './ToolExecuterView.css'

// class Item extends PureComponent {
//     constructor(props) {
//         super(props);
//     }

//     render() {
//         var device;
//         if (this.props.data.$device) {
//             device=<span className="MessageItemDevice">{this.props.data.$device}</span>;
//         } else {
//             device = null;
//         }
//         return <div className="MessageItem">
//             <span className="MessageItemDate">{timestampToDate(this.props.data.$timestamp).toLocaleTimeString()}</span>
//             {device}
//             <span className="MessageItemMessage">{this.props.data.$message}</span>
//         </div>;
//     }

//     static mapStateToProps(store, ownProps) {
//         return {
//             data: store.backend.indiManager.messages.byUid[ownProps.uid]
//         };
//     }
// }
// Item = connect(Item.mapStateToProps)(Item);

class ToolDisplay extends PureComponent {
    constructor(props) {
        super(props);
        this.startConfirm = this.startConfirm.bind(this);
        this.start = this.start.bind(this);
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

        mainBton = <input type="button" value="Go..." disabled={this.state.running ? "disabled": ""} style={{visibility: wantConfirm && this.state.started ? "hidden": ""}} onClick={wantConfirm ? this.startConfirm : this.start}/>;

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

    startConfirm() {
        this.setState({started: 1, error : null});
    }

    abort() {
        this.setState({started: 0});
    }

    start() {
        this.props.app.startTool(this.props.uid)
            .then(()=>{this.setState({running: 0})})
            .onError((e)=>{this.setState({running: 0, error: "" + e})})
            .onCancel(()=>{this.setState({running: 0, error: null})})
            .start();
        this.setState({running: 1, started: 0, error: null});
    }

    static mapStateToProps(store, ownProps) {
        return {
            desc: store.backend.toolExecuter.tools[ownProps.uid]
        };
    }
}
ToolDisplay = connect(ToolDisplay.mapStateToProps)(ToolDisplay);

class ToolsList extends PureComponent {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        var toolsUids = Object.keys(this.props.tools).sort();
        var content = toolsUids.map((uid)=>(this.props.tools[uid].hidden ? null : <ToolDisplay key={uid} uid={uid} app={this.props.app}/>));
        return <div>{content}</div>;
    }

    static mapStateToProps(store, ownProps) {
        return {
            tools: store.backend.toolExecuter.tools
        };
    }
}
ToolsList = connect(ToolsList.mapStateToProps)(ToolsList);

class ToolExecuterView extends PureComponent {

    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        //var self = this;
        return(<div className="ToolView"><ToolsList app={this.props.app}/></div>);
    }
}


export default ToolExecuterView;