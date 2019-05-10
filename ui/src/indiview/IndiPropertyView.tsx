/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component, PureComponent} from 'react';
import CancellationToken from 'cancellationtoken';
import * as Store from "../Store";
import * as Actions from "../Actions";
import * as BackendRequest from "../BackendRequest";
import * as IndiManagerStore from "../IndiManagerStore";
import * as Utils from "../Utils";
import "./IndiManagerView.css";
import { createSelector } from 'reselect';
import { IndiVector, IndiProperty } from '@bo/BackOfficeStatus';
import TextEdit from '@src/TextEdit';


type InputProps = {
    dev: string;
    vec: string;
    prop:string;
    showVecLabel: boolean;
    forcedValue: boolean;
    onChange: (prop:string, truc: boolean, value:string)=>(void);
}

type MappedProps = {
    vecLabel: IndiVector["$label"];
    vecType: IndiVector["$type"];
    vecRule: IndiVector["$rule"];
    vecPerm: IndiVector["$perm"];
    propLabel : IndiProperty["$label"];
    value: IndiProperty["$_"];
    format: IndiProperty["$format"];
}

type Props = InputProps & MappedProps;

const sexaFormatRe = /^%([0-9]*).([0-9]*)m$/;
const floatFormatRe = /^%([0-9]*)\.([0-9]*)f$/;

/** Render a property as key: value (readonly) */
class IndiPropertyView extends PureComponent<Props> {
    renderValue(value:string) {
        return this.renderValueWithFormat(value, this.props.format);
    }

    renderValueWithFormat(value:string, format?: string):string
    {
        if (format !== undefined)
        {
            var fixedFloatFormat = format.match(floatFormatRe);
            if (fixedFloatFormat) {
                var floatValue = parseFloat(value);
                if (isNaN(floatValue)) return value;

                if (fixedFloatFormat[2].length > 0) {
                    return floatValue.toFixed(parseInt(fixedFloatFormat[2]));
                } else {
                    return "" + floatValue;
                }
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

                const fvalue = parseFloat(value);
                if (isNaN(fvalue)) {
                    return "ERROR";
                }

                if (Math.abs(Math.round(fvalue * mult)) >= 1e+20) {
                    return value;
                }

                var str = "";
                var ivalue = Math.round(fvalue * mult);

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

    parseValue(value:string):string
    {
        var format = this.props.format;
        if (format !== undefined) {
            if (format.match(floatFormatRe)) {
                return "" + parseFloat(value);
            }
            if (format.match(sexaFormatRe)) {
                // Parse a float
                var sep;
                if ((sep = value.indexOf(':')) != -1) {
                    var head = value.substr(0, sep).trim();
                    head = head.replace(' ', '');

                    var floatValue = parseFloat(head);
                    if (isNaN(floatValue)) {
                        return "" + parseFloat(value);
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
                            return "" + parseFloat(value);
                        }
                        floatValue += v;
                        divider *= 60;
                    }
                    console.log("Parsed: " + floatValue);
                    return "" + floatValue;
                } else {
                    return "" + parseFloat(value);
                }
            }
        }

        return value;
    }
    // props: app, dev, vec, prop, showVecLabel,
    // props: forcedValue
    // onChange(newValue)
    render() {
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
                        this.props.onChange(
                            this.props.prop,
                            true,
                            this.props.value == 'On' ? 'Off' : 'On')
                    }}
                />

            } else {
                return <div className="IndiProperty">
                    <input
                        type="checkbox"
                        checked={this.props.value == 'On'}
                        onChange={(e) => {
                            this.props.onChange(
                                this.props.prop,
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
                            onChange={(e)=> {this.props.onChange(this.props.prop, false, this.parseValue(e))}}/>
                    </div>;
        } else {
            return <div className="IndiProperty">{label}: {this.renderValue(this.props.value)}</div>
        }

    }


    static mapStateToProps=(store: Store.Content, ownProps:InputProps)=>{
        const vec = Utils.noErr(()=>store.backend.indiManager!.deviceTree[ownProps.dev][ownProps.vec], undefined);

        const prop = vec === undefined
            ? undefined
            : Object.prototype.hasOwnProperty.call(vec.childs, ownProps.prop)
                ? vec.childs[ownProps.prop]
                : undefined;

        if (vec === undefined || prop === undefined) {
            return {
                vecLabel: "",
                vecType: "Switch",
                vecPerm: "",
                propLabel: "",
                vecRule: "",
                value: "",
                format: "",
            } as MappedProps
        } else {
            return {
                vecLabel: ownProps.showVecLabel ? vec.$label: undefined,
                vecType: vec.$type,
                vecRule: vec.$rule,
                vecPerm: vec.$perm,
                propLabel : prop.$label,
                value: ownProps.forcedValue != undefined ? ownProps.forcedValue: prop.$_,
                format: prop.$format
            } as MappedProps;
        }
    }
}

export default Store.Connect(IndiPropertyView);
