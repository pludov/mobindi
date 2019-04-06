/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';
import { atPath } from './shared/JsonPath';
import shallowequal from 'shallowequal';
import Collapsible from 'react-collapsible';
import "./Collapsible.css";
import Led from "./Led";
import Modal from './Modal';
import TextEdit from "./TextEdit";
import "./IndiManagerView.css";
import Icons from "./Icons"
import IconButton from "./IconButton";
import IndiDriverConfig from './IndiDriverConfig';

// Return a function that will call the given function with the given args
function closure() {
    var func = arguments[0];
    var args = Array.from(arguments).slice(1);
    var self = this;

    return ()=> {
        return func.apply(self, args);
    };
}

class IndiDriverSelector extends Component {
    constructor(props) {
        super(props);
    }

    render() {
        var deviceSelectorOptions = this.props.options.map((item) => <option key={item} value={item}>{item}</option>);
        return (<select value={this.props.current} 
            onChange={(e) => this.props.app.switchToDevice(e.target.value)}
            placeholder="Select device...">
            {deviceSelectorOptions}
        </select>);

    }

    // Limit the refresh for the selector (would reset selection)
    shouldComponentUpdate(nextProps, nextState) {
        return !shallowequal(nextProps, this.props,(a, b, k)=>(k == "options" ? shallowequal(a, b) : undefined));
    }

    static mapStateToProps(store) {
        var deviceSelectorOptions = [];

        var backend = store.backend.indiManager;

        var currentDeviceFound= false;

        var currentDevice = store.indiManager.selectedDevice;
        if (currentDevice == undefined) currentDevice = "";

        var found = {};
        if (Object.prototype.hasOwnProperty.call(backend, 'deviceTree')) {

            for(var o of Object.keys(backend.deviceTree).sort()) {
                if (o === currentDevice) currentDeviceFound = true;
                deviceSelectorOptions.push(o);
                found[o] = 1;
            }
        }

        var configuredDevices = atPath(backend, '$.configuration.indiServer.devices');
        if (configuredDevices) {
            for(var o of Object.keys(configuredDevices).sort())
            {
                if (Object.prototype.hasOwnProperty.call(found, o)) {
                    continue;
                }
                if (o === currentDevice) currentDeviceFound = true;
                deviceSelectorOptions.push(o);
            }
        }

        if (!currentDeviceFound) {
            deviceSelectorOptions.splice(0,0, currentDevice);
        }

        var result = {
            options: deviceSelectorOptions,
            current:currentDevice
        };
        return result;
    }
}

IndiDriverSelector = connect(IndiDriverSelector.mapStateToProps)(IndiDriverSelector);

class IndiDriverControlPanel extends PureComponent {
    constructor(props) {
        super(props);
    }

    render() {
        if (this.props.configured) {
            return <span>
                <Modal
                    flagPath='IndiManagerView/driverModalEditor'
                    flagValue={this.props.current}
                    ref={modal=>this.modal=modal}>
                    <IndiDriverConfig 
                            driverId={this.props.current}
                            app={this.props.app}/>
                </Modal>
                <input type='button'
                            className='IndiConfigButton'
                            onClick={() =>{this.modal.open()}}
                            value='...'/>
                <input type='button'
                            onClick={async () => await this.props.app.restartDriver(this.props.current)}
                            className='IndiRestartButton'
                            value={'\u21bb'}/>
            </span>
        }
        return null;
    }

    static mapStateToProps(store) {
        var deviceSelectorOptions = [];

        var backend = store.backend.indiManager;

        var currentDeviceFound= false;

        var currentDevice = store.indiManager.selectedDevice;
        if (currentDevice == undefined) currentDevice = "";

        var configured = false;
        var configuredDevices = atPath(backend, '$.configuration.indiServer.devices');
        if (configuredDevices && Object.prototype.hasOwnProperty.call(configuredDevices, currentDevice)) {
            configured = true;
        }

        var result = {
            current: currentDevice,
            configured: configured
        };
        return result;
    }
}

IndiDriverControlPanel = connect(IndiDriverControlPanel.mapStateToProps)(IndiDriverControlPanel);


const VectorStateToColor = {
    Idle: 'grey',
    Ok: 'green',
    Busy: 'yellow',
    Alert: 'red'
}

// Render as a drop down selector
class IndiSelectorPropertyView extends PureComponent {
    // props: app, dev, vec
    render() {
        var self = this;
        var options = [];
        var currentOption = undefined;

        for(var childId of this.props.childNames) {
            var child = this.props.childs[childId];

            options.push(<option key={child.$name} value={child.$name}>{child.$label}</option>);
            if (child.$_ == 'On') {
                currentOption = childId;
            }
        }

        return <select value={currentOption} onChange={(e) => {
            this.props.app.rqtSwitchProperty({
                dev: self.props.dev,
                vec: self.props.vec,
                children: [
                    {name: e.target.value, value: 'On'}
                ]});
        }}>{options}</select>;
    }

    static mapStateToProps(store, ownProps) {
        var vec;
        try {
            vec = store.backend.indiManager.deviceTree[ownProps.dev][ownProps.vec];
            if (vec == undefined) throw "vector not found";
        } catch (e) {
            throw new Error('One of many not found: ' + ownProps.dev + ' , ' + ownProps.vec + ' => ' + e);
        }

        return ({
            childs: vec.childs,
            childNames: vec.childNames
        })
    }
}

IndiSelectorPropertyView = connect(IndiSelectorPropertyView.mapStateToProps)(IndiSelectorPropertyView);

const sexaFormatRe = /^%([0-9]*).([0-9]*)m$/;
const floatFormatRe = /^%([0-9]*)\.([0-9]*)f$/;

function floatPadded(value, pad, decimal)
{
    if (value < 0) throw new Error("floatPadded only for >= 0");
    var rslt;
    if (decimal == 0) {
        rslt = value.toFixed(0)
    } else {
        rslt = value.toFixed(decimal);
    }
    
    var afterUnits = rslt.indexOf('.');
    if (afterUnits == -1) afterUnits = rslt.length;
    for(var i = afterUnits; i < pad; ++i)
        rslt = '0' + rslt;
    return rslt;
}

/** Render a property as key: value (readonly) */
class IndiPropertyView extends PureComponent {
    renderValue(value) {
        return this.renderValueWithFormat(value, this.props.format);
    }

    renderValueWithFormat(value, format)
    {
        if (format !== undefined)
        {
            var fixedFloatFormat = format.match(floatFormatRe);
            if (fixedFloatFormat) {
                var floatValue = parseFloat(value);
                if (isNaN(floatValue)) return value;

                if (fixedFloatFormat[2].length > 0) {
                    floatValue = floatValue.toFixed(parseInt(fixedFloatFormat[2]));
                }
                return floatValue;
            }
            
            var sexaFormat =  format.match(sexaFormatRe);
            if (sexaFormat) {
                var level = parseInt(sexaFormat[2]);
                var mult, pattern;
                if (level < 3) {
                    mult = 1;
                    pattern = "#";
                } else if (level <= 3) {
                    mult = 60;
                    pattern = "#:6#"
                } else if (level <= 5) {
                    mult = 600;
                    pattern = "#:6#.#"
                } else if (level <= 6) {
                    mult = 3600;
                    pattern = "#:6#:6#"
                } else if (level <= 8) {
                    mult = 36000;
                    pattern = "#:6#:6#.#"
                } else {
                    mult = 360000;
                    pattern = "#:6#:6#.##"
                }

                value = parseFloat(value);
                if (isNaN(value)) {
                    return "ERROR";
                }

                if (Math.abs(Math.round(value * mult)) >= 1e+20) {
                    return value;
                }

                var str = "";
                var ivalue = Math.round(value * mult);

                if (ivalue < 0) {
                    str += '-';
                    ivalue = -ivalue;
                }

                var xlatPattern = "";
                for(var i = pattern.length - 1; i >= 0; --i) {
                    var c = pattern[i];
                    if (c == '#' || c == '6') {
                        var div = (c == '#' ? 10 : 6);
                        var v = Math.floor(ivalue % div);
                        ivalue = Math.floor(ivalue / div);
                        c = v.toFixed(0);
                    } else {
                        c = pattern[i];
                    }
                    xlatPattern = c + xlatPattern;
                }
                while (ivalue >= 0.5) {
                    var v = Math.floor(ivalue % 10);
                    ivalue = Math.floor(ivalue / 10);

                    xlatPattern = v.toFixed(0) + xlatPattern;
                }
                str += xlatPattern;
                return str;
            }
            return value;
        } else {
            return value;
        }
    }

    parseValue(value)
    {
        var format = this.props.format;
        if (format !== undefined) {
            if (format.match(floatFormatRe)) {
                return parseFloat(value);
            }
            if (format.match(sexaFormatRe)) {
                // Parse a float
                var sep;
                if ((sep = value.indexOf(':')) != -1) {
                    var head = value.substr(0, sep).trim();
                    head = head.replace(' ', '');

                    var floatValue = parseFloat(head);
                    if (isNaN(floatValue)) {
                        return parseFloat(value);
                    }
                    var left = value.substr(sep + 1).trim();
                    var divider = 60;
                    if (head[0] == '-') {
                        divider = -60;
                    }
                    while(left.length) {
                        var toParse;
                        sep = left.indexOf(':');
                        if (sep != -1) {
                            toParse = left.substr(0, sep).trim();
                            left = left.substr(sep + 1).trim();
                        } else {
                            toParse = left;
                            left = '';
                        }
                        var v = parseFloat(toParse) / divider;
                        if (isNaN(v)) {
                            return parseFloat(value);
                        }
                        floatValue += v;
                        divider *= 60;
                    }
                    console.log("Parsed: " + floatValue);
                    return floatValue;
                } else {
                    return parseFloat(value);
                }
            }
        }

        return value;
    }
    // props: app, dev, vec, prop, showVecLabel,
    // props: forcedValue
    // onChange(newValue)
    render() {
        var self = this;
        var label = this.props.propLabel;
        if (this.props.vecLabel != undefined && label != this.props.vecLabel) {
            label = this.props.vecLabel + ": " + label;
        }

/*        var test = [ -400, -0.0001, 0.00001, 0.99999999999, 1.000000001, 20.9914239, 45212145421241.9914239, 1e19 ];
        var formats = [ "%1.0m", "%1.3m", "%1.5m", "%1.6m", "%1.8m", "%1.9m"];
        for(var i  = 0; i < test.length; ++i) {
            var v = test[i];
            console.log("with " + v);
            for(var j = 0; j < formats.length; ++j) {
                var format = formats[j];
                console.log('  ' + format + '   =>  ' + this.renderValueWithFormat(v, format));
            }
        }
*/
        if (this.props.vecType == 'Switch' && this.props.vecPerm != 'ro') {
            if (this.props.vecRule == 'AtMostOne') {
                return <input
                    type="button"
                    className={"IndiSwitchButton IndiSwitchButton" + this.props.value}
                    value={label}
                    onClick={(e) => {
                        self.props.onChange(
                            self.props.prop,
                            true,
                            self.props.value == 'On' ? 'Off' : 'On')
                    }}
                />

            } else {
                return <div className="IndiProperty">
                    <input
                        type="checkbox"
                        checked={this.props.value == 'On'}
                        onChange={(e) => {
                            self.props.onChange(
                                self.props.prop,
                                true, // Could be false as well... Depends on driver
                                e.target.checked ? 'On' : 'Off');
                        }}
                    ></input>
                    {label}</div>
            }
        } else if (this.props.vecPerm != 'ro') {
            return <div className="IndiProperty">
                        {label}: 
                        <TextEdit 
                            value={this.renderValue(this.props.value)} 
                            onChange={(e)=> {self.props.onChange(self.props.prop, false, self.parseValue(e))}}/>
                    </div>;
        } else {
            return <div className="IndiProperty">{label}: {this.renderValue(this.props.value)}</div>
        }

    }


    static mapStateToProps(store, ownProps) {
        var prop, vec;
        try {
            vec = store.backend.indiManager.deviceTree[ownProps.dev][ownProps.vec];
            prop = vec.childs[ownProps.prop];
        } catch(e) {
            throw new Error('Property not found: ' + ownProps.dev + ' , ' + ownProps.vec + ' , ' + ownProps.prop + ' => ' + e);
        }

        return ({
            vecLabel: ownProps.showVecLabel ? vec.$label: undefined,
            vecType: vec.$type,
            vecRule: vec.$rule,
            vecPerm: vec.$perm,
            propLabel : prop.$label,
            value: ownProps.forcedValue != undefined ? ownProps.forcedValue: prop.$_,
            format: prop.$format
        });
    }
}

IndiPropertyView = connect(IndiPropertyView.mapStateToProps)(IndiPropertyView);

/** Render a vector, depending on its type and access rules */
class IndiVectorView extends PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            pendingChange: false
        };
        this.pushMultiValue = this.pushMultiValue.bind(this);
        this.changeCallback = this.changeCallback.bind(this);
        this.cancelPendingChanges = this.cancelPendingChanges.bind(this);
    }

    pendingChangesIds() {
        var rslt = [];
        for(var o of Object.keys(this.state)) {
            if (o.startsWith("forced_")) {
                var id = o.substring(7);
                rslt.push(id);
            }
        }
        return rslt;
    }


    cancelPendingChanges() {
        var newState = {};
        for(var id of this.pendingChangesIds()) {
            newState["forced_" + id] = undefined;
        }
        newState.pendingChange = false;
        this.setState(newState);
    }

    doneRequest(request) {
        this.cancelPendingChanges();
    }

    async pushMultiValue() {
        var req = {
            dev: this.props.dev,
            vec: this.props.vec,
            children: []
        };
        var newState = {};
        for(var o of Object.keys(this.state)) {
            if (o.startsWith("forced_")) {
                var id = o.substring(7);
                var value = this.state[o];
                newState[o] = undefined;
                req.children.push({name: id, value: value});
            }
        }

        this.setState(newState);
        
        await this.props.app.rqtSwitchProperty(req)
        this.doneRequest(req);
    }

    async changeCallback(id, immediate, value) {
        if ((!immediate) && this.props.childs.length > 1) {
            // Do nothing for now
            this.setState({
                ["forced_" + id]: value,
                pendingChange: true
            });
        } else {
            // Direct push of the value
            const request = {
                dev: this.props.dev,
                vec: this.props.vec,
                children: [
                    {name: id, value: value}
                ]
            };
            await this.props.app.rqtSwitchProperty(request);
            this.doneRequest(request);
        }
    }

    // props: app
    // props: dev
    // props: vec
    render() {
        var self = this;
        var ledColor = VectorStateToColor[this.props.state];
        if (ledColor == undefined) {
            ledColor = VectorStateToColor['Alert'];
        }

        var content;
        if (this.props.type == 'Switch' && this.props.rule == 'OneOfMany' && this.props.perm != "ro") {
            content = <div className="IndiProperty">{this.props.label}:
                <IndiSelectorPropertyView app={this.props.app} dev={this.props.dev} vec={this.props.vec}>
                </IndiSelectorPropertyView>
            </div>;
        } else if (this.props.childs.length > 0) {
            content = this.props.childs.map(
                (id) => <IndiPropertyView app={self.props.app} dev={self.props.dev}
                                showVecLabel={this.props.childs.length == 1}
                                onChange={this.changeCallback}
                                vec={self.props.vec} prop={id} key={'child_' + id}
                                forcedValue={self.state["forced_" + id]}/>);
            if (this.props.childs.length > 1) {
                content.splice(0, 0, 
                        <div
                            key='$$$title$$$' 
                            className="IndiVectorTitle">
                                {this.props.label}
                                {this.props.perm == 'ro' ? null :
                                    <IconButton 
                                        src={Icons.dialogOk} 
                                        onClick={this.pushMultiValue}
                                        visible={self.state.pendingChange}/>
                                }
                                {this.props.perm == 'ro' ? null :
                                    <IconButton
                                        src={Icons.dialogCancel}
                                        onClick={this.cancelPendingChanges}
                                        visible={self.state.pendingChange}/>
                                }
                        </div>
                        );
            }
        } else {
            content = <div className="IndiProperty">{this.props.label}></div>;
        }

        return <div className="IndiVector"><Led color={ledColor}></Led><div className="IndiVectorProps">{content}</div></div>
    }

    static mapStateToProps(store, ownProps) {
        var rslt = {};
        var vec;
        try {
            vec = store.backend.indiManager.deviceTree[ownProps.dev][ownProps.vec];
        } catch(e) {}

        if (vec != undefined) {
            rslt = {
                label: vec.$label,
                state: vec.$state,
                type: vec.$type,
                rule: vec.$rule,
                perm: vec.$perm,
                childs: vec.childNames
            }
        } else {
            rslt = {
                label: "N/A",
                state: 'Error',
                childs: []
            }
        }
        return rslt;
    }
}

IndiVectorView = connect(IndiVectorView.mapStateToProps)(IndiVectorView);

class IndiManagerView extends Component {
    constructor(props) {
        super(props);

        this.state = { value: ''};
    }

    render() {
        var bs = this.props.indiManager;
        if (bs == undefined || bs == null) {
            return null;
        }

        var vectors = [];
        var currentDevice = this.props.uiState.selectedDevice;
        if (currentDevice == undefined) currentDevice = "";
        if (currentDevice != "") {
            if (Object.prototype.hasOwnProperty.call(this.props.indiManager.deviceTree, currentDevice)) {
                var deviceProps = this.props.indiManager.deviceTree[currentDevice];

                // Les groupes ouverts
                var opens = this.props.uiState.expandedGroups[currentDevice];

                var groups = {};
                for(var key in deviceProps) {
                    var grpId = deviceProps[key].$group;
                    groups[grpId] = {
                        opened: Object.prototype.hasOwnProperty.call(opens, grpId) && opens[grpId],
                        vectors: []
                    };
                }
                var groupIds = Object.keys(groups).sort();
                for(let group of groupIds) {
                    var groupDesc = groups[group];
                    let childs = [];
                    for(var key of Object.keys(deviceProps).filter((e)=>{return deviceProps[e].$group == group}).sort()) {
                        childs.push(<IndiVectorView app={this.props.app} key={currentDevice +':vector:' +key} dev={currentDevice} vec={key}/>);
                    }

                    vectors.push(<Collapsible
                        key={currentDevice + ":" + group}
                        open={groupDesc.opened}
                        onOpening={()=>this.props.app.setGroupState(currentDevice, group, true)}
                        onClosing={()=>this.props.app.setGroupState(currentDevice, group, false)}
                        transitionTime={200}
                        trigger={group}
                        lazyRender={true}>{childs}</Collapsible>);
                    /**
                     *                 // Parcourir les groupes
                     for (var key in deviceProps) {
                    vectors.push(<div key={key}>{JSON.stringify(deviceProps[key])}</div>);
                }

                     */
                }
            }


        }





        return (
            <div className="Page">
                <div className={'IndiAppState IndiAppState_' + bs.status}>Server: {bs.status}
                </div>

                <div className="IndiDriverSelector">
                    Driver: <IndiDriverSelector app={this.props.app}/>
                    <IndiDriverControlPanel app={this.props.app}/>
                </div>

                <div className="IndiPropertyView">
                    {vectors}
                </div>
            </div>);
    }
}


const mapStateToProps = function(store) {
    var result = {
        indiManager: store.backend.indiManager,
        uiState:store.indiManager
    };
    return result;
}

export default connect(mapStateToProps)(IndiManagerView);