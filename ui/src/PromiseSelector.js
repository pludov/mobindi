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

        var availables = this.props.availables;
        var options = [];

        if (this.state.forcedValue !== undefined) {
            active = this.state.forcedValue;
        }
        console.log('WTF with keys');

        if (active == null) {
            console.log("WTF key = null");
            options.push(<option value='null' key='null'>{this.props.placeholder}</option>)
        }

        if (active != null) {
            var present = false;
            for(var o of availables) {
                if (this.props.getId(o) === active) {
                    present = true;
                }
            }
            if (!present) {
                console.log("missing WTF key = " + JSON.stringify(active));
                options.push(<option value={JSON.stringify(active)} key={JSON.stringify(active)}>{active}</option>);
            }
        }

        for(var v of availables) {
            var id = JSON.stringify(this.props.getId(v));
            console.log("WTF key = " + id);
            options.push(<option value={id} key={id}>{this.props.getTitle(v)}</option>);
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

        function treatmentDone() {
            if (self.state.runningPromise != treatment) return;
            self.setState({runningPromise: undefined, forcedValue: undefined});
        }

        treatment.then(treatmentDone);
        treatment.onError(treatmentDone);
        treatment.onCancel(treatmentDone);

        this.setState({runningPromise : treatment, forcedValue: d});
        treatment.start();
    }
}

PromiseSelector.defaultProps = {
    getTitle: (e)=>'' + e,
    getId: (e)=>e,
    placeholder: 'Choose...'
}

PromiseSelector.propTypes = {
    active: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number
    ]),
    availables: PropTypes.array.isRequired,
    placeholder: PropTypes.string,
    // entry from availables
    getTitle: PropTypes.func,
    getId: PropTypes.func,
    // receive an id, must return a promise
    setValue: PropTypes.func.isRequired
}


export default PromiseSelector;
