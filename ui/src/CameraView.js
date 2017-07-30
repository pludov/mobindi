import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';
import FitsViewer from './FitsViewer';
import './CameraView.css'

class CameraView extends PureComponent {

    constructor(props) {
        super(props);
        this.state = {url: 'test.jpg'};
        this.next = this.next.bind(this);
    }

    render() {
        return(<div className="CameraView">
            <div className="FitsViewer">
                <FitsViewer src={this.state.url}/>
            </div>
            <input type="button" onClick={this.next} value="next"/>
        </div>);
    }

    next() {
        console.log('WTF : new state from ' + JSON.stringify(this.state));
        this.setState({url: this.state.url != 'test.jpg' ? 'test.jpg' : 'http://127.0.0.1:18080/plop.png'});
    }
}


export default CameraView;