import React, { Component, PureComponent} from 'react';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';
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

class CameraSettingsView extends PureComponent {
    // props:
    //      settingsPath: path to currentSettings,
    //      descPath: path to currentSettingDesc
    constructor(props) {
        super(props);
    }

    render() {
        var content = [];
        for(var item of this.props.list) {
            var d = <CameraSettingView
                key={item}
                settingPath={this.props.settingsPath.concat(item)}
                descPath={this.props.descPath.concat(item)}
            />
            content.push(d);
        }

        return(<div>{content}</div>);
    }

    static mapStateToProps = function(store, ownProps) {

        return ({
            list: atPath(store, ownProps.descPath.concat('$order'))
        });
    }
}


export default connect(CameraSettingsView.mapStateToProps)(CameraSettingsView);