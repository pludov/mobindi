import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';

/**
 * A selector that start a promise on update
 * 
 * Supported values: numbers, strings, booleans, null
 */
class PromiseSelector extends PureComponent {
    constructor(props) {
        super(props);
        this.state = {};
    }
    render() {
        var active = this.props.active;
        if (active == undefined) active = null;

        var availables = this.props.availablesGenerator(this.props);
        var options = [];

        if (this.state.forcedValue !== undefined) {
            active = this.state.forcedValue;
        }
        console.log('WTF with keys');

        if (active == null || this.props.nullAlwaysPossible) {
            console.log("WTF key = null");
            options.push(<option value='null' key='null'>{this.props.placeholder}</option>)
        }

        if (active != null) {
            var present = false;
            for(var o of availables) {
                if (this.props.getId(o, this.props) === active) {
                    present = true;
                }
            }
            if (!present) {
                console.log("missing WTF key = " + JSON.stringify(active));
                options.push(<option value={JSON.stringify(active)} key={JSON.stringify(active)}>{active}</option>);
            }
        }

        for(var v of availables) {
            var id = JSON.stringify(this.props.getId(v, this.props));
            console.log("WTF key = " + id);
            options.push(<option value={id} key={id}>{this.props.getTitle(v, this.props)}</option>);
        }

        return <select
                    disabled={this.state.runningPromise !== undefined}
                    value={JSON.stringify(active)}
                    onChange={(e)=>this.selectEntry(JSON.parse(e.target.value))}>{options}
            </select>;
    }

    selectEntry(d) {
        var self = this;
        if (this.state.runningPromise) {
            this.state.runningPromise.cancel();
        }
        var treatment = this.props.setValue(d);
        var treatmentDoneCalled = false;
        function treatmentDone() {
            treatmentDoneCalled = true;
            if (self.state.runningPromise != treatment) return;
            self.setState({runningPromise: undefined, forcedValue: undefined});
        }

        treatment.then(treatmentDone);
        treatment.onError(treatmentDone);
        treatment.onCancel(treatmentDone);

        treatment.start();
        if (!treatmentDoneCalled) {
            // Warning: treatment can finish before setState really occurs
            // in that case, treatmentDone will have already been called.
            this.setState({runningPromise : treatment, forcedValue: d});
        }
    }
}

PromiseSelector.defaultProps = {
    getTitle: (e)=>'' + e,
    getId: (e)=>e,
    placeholder: 'Choose...',
    availablesGenerator: (props)=>props.availables
}

PromiseSelector.propTypes = {
    active: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number
    ]),
    availables: PropTypes.array,
    availablesGenerator: PropTypes.func,
    placeholder: PropTypes.string,
    // entry from availables
    getTitle: PropTypes.func,
    getId: PropTypes.func,
    // receive an id, must return a promise
    setValue: PropTypes.func.isRequired,
    // Keep "null" always possible
    nullAlwaysPossible: PropTypes.bool
}


export default PromiseSelector;
