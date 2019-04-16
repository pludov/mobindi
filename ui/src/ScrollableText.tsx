import * as React from 'react';

import './ScrollableText.css';

type Props = {
    className?: string;
};

export default class extends React.PureComponent<Props> {
    render() {
        const children = React.Children.toArray(this.props.children);
        return <div className={(this.props.className ? this.props.className + ' ' : '') + 'ScrollableText'} title={children.join(' ')}>
            <div className={'ScrollableTextChild'}>
                <div>{this.props.children}</div>
            </div>
        </div>
    }

}
