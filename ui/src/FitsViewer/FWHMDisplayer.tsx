import React, { Component, PureComponent} from 'react';
import * as BackendRequest from "../BackendRequest";
import CancellationToken from 'cancellationtoken';

export type Props = {
    src: string|null;
};

export type State = {
    src: string|null;
    value: string|null;
    loading: boolean;
};

export default class FWHMDisplayer extends PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            src: null,
            value: null,
            loading: false
        }
    }

    async _loadData() {
        if (this.props.src === this.state.src) {
            return;
        }
        // Start a new loading.
        // cancel the previous request
        this._cancelLoadData();
        this.setState({
            src: this.props.src,
            value: null,
            loading: true
        });
        const self = this;

        try {
            const e = await BackendRequest.ImageProcessor(
                CancellationToken.CONTINUE,
                {
                    starField: { "source": { "path":this.props.src!}}
                }
            );

            let fwhmSum = 0;
            for(let star of e.stars) {
                fwhmSum += star.fwhm
            }
            if (e.stars.length) {
                fwhmSum /= e.stars.length;
            }

            const stat = fwhmSum.toFixed(2) + " - " + e.stars.length + " stars"

            this.setState({
                value: stat,
                loading: false
            });
        } catch(e) {
            this.setState({
                value: null,
                loading: false
            });
        };
    }

    _cancelLoadData() {
        // Not implemented
        console.log('FIXME: canceling FWHMDisplayer is not implemented');
    }

    componentWillUnmount() {
        this._cancelLoadData();
    }

    componentDidMount() {
        this._loadData();
    }

    componentDidUpdate(prevProps:Props, prevState:State) {
        this._loadData();
    }

    render() {
        if (this.state.value === null) {
            if (this.state.loading) {
                return <div>...</div>;
            } else {
                return <div>N/A</div>;
            }
        } else {
            return <div>{this.state.value}</div>
        }
    }
}
