import React from 'react';
import $ from 'jquery';

import './StatusLabel.css';

type Props = {
    className: string;
    text: string;
}

export default class StatusLabel extends React.PureComponent<Props> {
    readonly el: React.RefObject<HTMLSpanElement>
    render() {
        return <span
                    ref={this.el}
                    className={this.props.className + " StatusLabel"}
                    title={this.props.text}>
                    {this.props.text}
                </span>;
    }

    componentDidMount() {
        // FIXME: ajouter un handler on touch
        var elt = $(this.el);
        let moved:boolean = false, justAdded: boolean = false;

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

