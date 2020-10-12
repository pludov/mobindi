import React, { Component, PureComponent} from 'react';

type Props = {
    key: string;
}

type State = {
}


export default class FloatWindow extends React.PureComponent<Props, State> {
    timeout: NodeJS.Timeout;

    constructor(props:Props) {
        super(props);
        this.state = {cpt: 0};
    }

    render() {
        return this.props.children;
    }

}