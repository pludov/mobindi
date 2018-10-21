import React, { Component, PureComponent} from 'react';

import './ScrollableText.css';

class ScrollableText extends PureComponent {
    render() {
        return <div className={(this.props.className ? this.props.className + ' ' : '') + 'ScrollableText'} title={this.props.children}>
            <div className={'ScrollableTextChild'}>
                <div>{this.props.children}</div>
            </div>
        </div>
    }

}

export default ScrollableText;