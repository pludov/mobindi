import React, { Component } from 'react';
import { connect } from 'react-redux';
import './Screen.css';

/** Force un affichage en mode plein ecran, de taille fixe */

class Screen extends Component {

    render() {
        return (<div className="Screen">{this.props.children}</div>);
    }
}


export default Screen;

