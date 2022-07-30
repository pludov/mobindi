import * as React from 'react';
import * as Help from "./Help";
import "./Modal.css";

type Props = {
    forceVisible?: boolean;
    onClose?:()=>(void);
    closeHelpKey?: Help.Key;
    closeOnChange?: any;
    title?: React.ReactElement;
    controlButtons?: React.ReactElement;
}

type State = {
    visible: boolean;
    currentCloseOnChange: any;
}

// Remark: this could also be used for selectors
class Modal extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            visible: false,
            currentCloseOnChange: undefined
        }
    }

    static getDerivedStateFromProps(props: Props, state: State) {
        if (state.visible && state.currentCloseOnChange !== props.closeOnChange) {
            return {visible: false, currentCloseOnChange: undefined}
        }
        return {}
    }

    render() {
        if (!this.state.visible && !this.props.forceVisible) {
            return null;
        }

        return <div className="Modal">
                    <div className="ModalContainer">
                        {this.props.title
                            ? <div className="ModalTitle">{this.props.title}</div>
                            : null
                        }
                        <div className="ModalContent">
                            {this.props.children}
                        </div>
                        <div className="ModalBar">
                            {this.props.controlButtons || null}
                            <input type='button' value={this.props.closeHelpKey?.title || 'Close'} onClick={this.close} {...this.props.closeHelpKey?.dom()}/>
                        </div>
                    </div>
        </div>;
    }

    public readonly open=()=>{
        this.setState({visible: true, currentCloseOnChange: this.props.closeOnChange});
    }

    public readonly close=()=>{
        this.setState({visible: false});
        if (this.props.onClose) {
            this.props.onClose();
        }
    }
}


export default Modal;
