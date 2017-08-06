import React, { Component, PureComponent} from 'react';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';
import PromiseSelector from './PromiseSelector';
import FitsViewer from './FitsViewer';
import './CameraView.css'

function atPath(obj, path) {
    var start = obj;
    var result = obj;

    for(var i = 0; i < path.length; ++i) {
        // Don't search for childs in final value
        if (result === undefined || result === null || !((typeof result) == "object")) {
            return undefined;
        }
        var item = path[i];
        if (!Object.prototype.hasOwnProperty.call(result, item)) {
            // prop not found
            return undefined;
        }
        result = result[item];
    }

    if (result === undefined) {
        console.error('Could not find ' + path + ' in ', JSON.stringify(start, null, 2));
    }
    return result;
}

class CameraSettingView extends PureComponent {
    //      settingPath: [path] to currentSettings[item],
    //      descPath: [path] to currentSettingDesc[item]
    constructor(props) {
        super(props);
    }

    render() {
        return <div>
            <div>{this.props.desc.title}:</div>
            <div>{this.props.setting}</div>
        </div>
    }

    static mapStateToProps = function(store, ownProps) {

        return ({
            setting: atPath(store, ownProps.settingPath),
            desc: atPath(store, ownProps.descPath)
        });
    }
}

CameraSettingView = connect(CameraSettingView.mapStateToProps)(CameraSettingView);

const BinSelector = connect((store, ownProps)=> ({
    active: atPath(store, ownProps.valuePath),
    availables: atPath(store, ownProps.descPath.concat('values'))
}))(PromiseSelector);

class CameraSettingsView extends PureComponent {
    // props:
    //      settingsPath: path to currentSettings,
    //      descPath: path to currentSettingDesc
    //     setValue: (key)=>(value)=>promise
    constructor(props) {
        super(props);
    }

    render() {
        var content = [];

        // Display bin. A list

        if (this.props.binDesc !== undefined) {
            content.push(<BinSelector
                key='bin'
                descPath={this.props.descPath.concat('bin')}
                valuePath={this.props.settingsPath.concat('bin')}
                setValue={this.props.setValue('bin')}
            />);
        }

        return(<div>{content}</div>);
    }

    static mapStateToProps = function(store, ownProps) {
        return ({
            binDesc: atPath(store, ownProps.descPath.concat('bin'))
        });
    }
}


export default connect(CameraSettingsView.mapStateToProps)(CameraSettingsView);