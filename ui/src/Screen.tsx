import * as React from 'react';
import './Screen.css';

/** Force un affichage en mode plein ecran, de taille fixe */
export default class Screen extends React.Component {

    render() {
        return (<div className="Screen">{this.props.children}</div>);
    }
}

