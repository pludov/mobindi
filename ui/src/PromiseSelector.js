import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';

/**
 * A selector that start a promise on update
 * Does not support empty value
 */
class PromiseSelector extends PureComponent {
    constructor(props) {
        super(props);
        this.state = {};
    }
    render() {
        var active = this.props.active;
        var availables = this.props.availables;
        var options = [];

        if (this.state.forcedValue !== undefined) {
            active = this.state.forcedValue;
        }

        if (active == null || active == undefined) active = '';
        if (active == '') {
            options.push(<option value='' key=''>{this.props.placeholder}</option>)
        }

        if (active != '' && availables.indexOf(active) == -1) {
            options.push(<option value={active} key={active}>{v} - <i>NOT AVAILABLE</i></option>);
        }

        for(var v of availables) {
            options.push(<option value={v} key={v}>{v}</option>);
        }
        return <select disabled={this.state.runningPromise !== undefined} value={active} onChange={(e)=>this.selectDevice(e.target.value)}>{options}</select>;
    }

    selectDevice(d) {
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
    getTitle: (e)=>e,
    getId: (e)=>e,
    placeholder: 'Choose...'
}

PromiseSelector.propTypes = {
    active: PropTypes.string.isRequired,
    availables: PropTypes.array.isRequired,
    placeholder: PropTypes.string,
    // entry from availables
    getTitle: PropTypes.func,
    getId: PropTypes.func,
    // receive an id, must return a promise
    setValue: PropTypes.func.isRequired
}


export default PromiseSelector;
