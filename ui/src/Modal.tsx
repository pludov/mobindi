import * as React from 'react';
import "./Modal.css";

type Props = {

}

type State = {
    visible: boolean;
}

// Remark: this could also be used for selectors
class Modal extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            visible: false
        }
    }

    render() {
        if (!this.state.visible) {
            return null;
        }

        return <div className="Modal">
                    <div className="ModalContent">
                        {this.props.children}
                        <input type='button' value='Close' onClick={this.close}/>
                    </div>
        </div>;
    }

    public readonly open=()=>{
        this.setState({visible: true});
    }

    public readonly close=()=>{
        this.setState({visible: false});
    }
}


export default Modal;
