import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';

class IconButton extends PureComponent {

    render() {
        var className = "IconButton";
        if (this.props.visible !== undefined && !this.props.visible) {
            className += " hidden";
        }

        return <img className={className} src={this.props.src} onClick={this.props.onClick}/>
    }
}


IconButton.propTypes = {
    src: PropTypes.any.isRequired,
    onClick: PropTypes.func.isRequired,
    visible: PropTypes.bool
}


export default IconButton;