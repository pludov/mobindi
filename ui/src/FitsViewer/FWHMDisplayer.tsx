import React, { Component, PureComponent} from 'react';
import * as BackendRequest from "../BackendRequest";
import CancellationToken from 'cancellationtoken';

export type Props = {
    path: string|null;
    streamId: string|null;
};

export type State = {
    path: string|null;
    streamId: string|null;
    value: string|null;
    loading: boolean;
};

export default class FWHMDisplayer extends PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            path: null,
            streamId: null,
            value: null,
            loading: false
        }
    }

    async _loadData() {
        if (this.props.path === this.state.path && this.props.streamId == this.state.streamId) {
            return;
        }
        // Start a new loading.
        // cancel the previous request
        this._cancelLoadData();
        this.setState({
            path: this.props.path,
            streamId: this.props.streamId,
            value: null,
            loading: true
        });
        const self = this;

        try {
            const e = await BackendRequest.ImageProcessor(
                CancellationToken.CONTINUE,
                {
                    starField: { "source": {
                        path: this.props.path || "",
                        streamId: this.props.streamId || "",
                    }}
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
