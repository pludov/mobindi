import React from 'react';
import * as Store from "../Store";

import "./MiniMap.css";

type InputProps = {
    className?: string;
};
type MappedProps = {
}
type Props = InputProps & MappedProps;


class MiniMap extends React.PureComponent<Props> {



    render() {
        return (<div className={`MiniMapContainer ${this.props.className || ''}`}>
            {this.props.children}
        </div>);
    }

    static mapStateToProps(store: Store.Content, props: InputProps):MappedProps {
        return {}
    }
}

export default Store.Connect(MiniMap);