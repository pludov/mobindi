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

function availablesFromRange(props) {
    var result = [];
    console.log('WTF props: ' + JSON.stringify(props));
    if (props.$min != undefined) {
        var step =  parseFloat(props.$step);
        var min = parseFloat(props.$min);
        var max = parseFloat(props.$max);

        for(var i = min; i <= max && result.length < 1000; i += step)
        {
            result.push(i);
        }
    }
    return result;
}

const SettingSelector = connect((store, ownProps)=> {
    var desc = atPath(store, ownProps.descPath);
    console.log('WTF : SettingsSelector.mapStateToProps : desc = ' +JSON.stringify(desc));
    return ({
        active: atPath(store, ownProps.valuePath),
        availablesGenerator: availablesFromRange,
        $min: atPath(desc, ['$min']),
        $max: atPath(desc, ['$max']),
        $step: atPath(desc, ['$step'])
    });
})(PromiseSelector);

class CameraSettingsView extends PureComponent {
    // props:
    //      settingsPath: path to currentSettings,
    //      activePath: path to the property that hold the camera id
    //     setValue: (key)=>(value)=>promise
    constructor(props) {
        super(props);
    }

    render() {
        var self = this;
        var content = [];

        // Setting is a list
        function selectorProp(vector, prop) {
            return function(name) {
                return <SettingSelector
                    key={name}
                    descPath={['backend', 'indiManager', 'deviceTree', self.props.current, vector, 'childs', prop]}
                    valuePath={self.props.settingsPath.concat(name)}
                    setValue={self.props.setValue(name)}
                />
            }
        }

        // Render a setting if present
        function setting(name, provider)
        {
            content.push(<span className='cameraSetting' key={name}>{name}: {provider(name)}</span>);
        }

        setting('bin', selectorProp('CCD_BINNING', 'HOR_BIN'));
        //setting('iso', selectorProp);
        setting('exp', selectorProp('CCD_EXPOSURE', 'CCD_EXPOSURE_VALUE'));

        return(<div>{content}</div>);
    }

    static mapStateToProps = function(store, ownProps) {
        return ({
            current: atPath(store, ownProps.activePath)
        });
    }
}


export default connect(CameraSettingsView.mapStateToProps)(CameraSettingsView);