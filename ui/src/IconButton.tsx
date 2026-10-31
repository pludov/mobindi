import * as React from 'react';

export type Props = {
    visible?: boolean;
    onClick: ()=>(void);
    src: string;
    alt: string;
}

export default class IconButton extends React.PureComponent<Props> {

    render() {
        var className = "IconButton";
        if (this.props.visible !== undefined && !this.props.visible) {
            className += " hidden";
        }

        return <img className={className} src={this.props.src} alt={this.props.alt} onClick={this.props.onClick}/>
    }
}
