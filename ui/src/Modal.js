import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';
import { store, storeManager, notifier, BackendStatus } from './Store';
import PropTypes from 'prop-types';


// Remark: this could also be used for selectors
class Modal extends PureComponent {
    constructor(props) {
        super(props);
        this.unsubscribe = null;
        this.open = this.open.bind(this);
        this.close = this.close.bind(this);
        this.onStoreChange = this.onStoreChange.bind(this);
    }

    render() {
        if (!this.props.visible) {
            return null;
        }

        return <div className="Modal">
                    <div className="ModalContent">
                        {this.props.children}
                        <input type='button' value='Close' onClick={this.close}/>
                    </div>
        </div>;
    }

    open() {
        if ((!getModalState(store.getState(), this.props.flagPath, this.props.flagValue)) && Modal.isDisplayable(store.getState(), this.props)) {
            console.log('will dispatch');
            store.dispatch({type: 'appAction', 'app': 'modal', method:'switch', args: [this.props.flagPath, this.props.flagValue || ""]});
        }
    }

    close() {
        store.dispatch({type: 'appAction', 'app': 'modal', method:'switch', args: [this.props.flagPath, null]});
    }

    onStoreChange() {
        const state = store.getState();
        if (getModalState(state, this.props.flagPath, this.props.flagValue) && !Modal.isDisplayable(state, this.props)) {
            // update the flag in the store
            store.dispatch({type: 'appAction', 'app': 'modal', method:'switch', args: [this.props.flagPath, null]});
        }
    }

    componentWillMount() {
        this.unsubscribe = store.subscribe(this.onStoreChange);
        this.onStoreChange();
    }

    componentWillReceiveProps(nextProps) {
        if (this.props.flagPath !== nextProps.flagPath
                || this.props.flagPath !== nextProps.flagValue
                || this.props.isDisplayable !== nextProps.isDisplayable) {
            this.onStoreChange();
        }
    }

    componentWillUnmount() {
        this.unsubscribe();
    }

    static isDisplayable(store, ownProps) {
        if (ownProps.isDisplayable === undefined) {
            return true;
        }
        return ownProps.isDisplayable(store);
    }

    // State within the redux store
    static mapStateToProps(store, ownProps) {
        return {
            visible: getModalState(store, ownProps.flagPath, ownProps.flagValue)
                ? Modal.isDisplayable(store, ownProps)
                : false
        }
    }
}

const unconnected = Modal.prototype.open;
Modal = connect(Modal.mapStateToProps)(Modal);
Modal.prototype.open = unconnected;


Modal.propTypes = {
    // Key to the modal prop
    flagPath: PropTypes.string.isRequired,
    // Value (to force close on value change)
    flagValue: PropTypes.string,
    // Check if the modal must close
    isDisplayable: PropTypes.func
}

function storeWithModalStatus(store) {
    if (!Object.prototype.hasOwnProperty.call(store, 'modalStatus')) {
        return {
            ...store,
            modalStatus: {}
        };
    }
    return store;
}

function getRawModalState(store, key)
{
    if (!Object.prototype.hasOwnProperty.call(store, 'modalStatus')) {
        return null;
    }
    if (!Object.prototype.hasOwnProperty.call(store.modalStatus, key)) {
        return null;
    }
    return store.modalStatus[key];
}

function getModalState(store, key, value)
{
    if (value === undefined) value = '';
    return getRawModalState(store, key) === value;
}

function openModal(store, path, value)
{
    store = storeWithModalStatus(store);

    return {
        ...store,
        modalStatus: {
            ...store.modalStatus,
            [path]: value
        }
    };
}

function closeModal(store, path)
{
    // remove path
    store = storeWithModalStatus(store);

    const modalStatusWithoutValue = {...store.modalStatus};
    delete modalStatusWithoutValue[path];
    return {
        ...store,
        modalStatus: modalStatusWithoutValue
    };
}

storeManager.addActions("modal", {
    "switch": function(store, path, value) {
        if (getRawModalState(store, path) === value) {
            console.log('Switch: not needed');
            return store;
        }
        if (value !== null) {
            // add path
            console.log('setting modal ' + path + ' to ' + value);
            return openModal(store, path, value);
        } else {
            // remove path
            console.log('clearing modal');
            return closeModal(store, path);
        };
    }
});

export default Modal;
