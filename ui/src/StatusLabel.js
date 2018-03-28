import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';

import './StatusLabel.css';


class StatusLabel extends PureComponent {

    render() {
        return <span
                    ref={el => this.el = el}
                    className={this.props.className + " StatusLabel"}
                    title={this.props.text}>
                    {this.props.text}
                </span>;
    }

    componentDidMount() {
        // FIXME: ajouter un handler on touch
        var elt = $(this.el);
        var moved, justAdded;

        elt.on('touchstart', function() {
            if (!elt.hasClass('StatusLabelWithDetails')) {
                elt.addClass('StatusLabelWithDetails');
                justAdded = true;
            } else {
                justAdded = false;
            }
            moved = false;
            
        });
        elt.on('touchmove', function() {
            moved = true;
        });
        elt.on('touchend', function() {
            if (justAdded) return;
            if (elt.hasClass('StatusLabelWithDetails') && !moved) {
                elt.scrollLeft(0);
                elt.removeClass('StatusLabelWithDetails');
            }
        });
        
        //elt.on('mousedown', toggleFunc);
    }
}

StatusLabel.propTypes = {
    text: PropTypes.string.isRequired,
    className: PropTypes.string
}

export default StatusLabel;