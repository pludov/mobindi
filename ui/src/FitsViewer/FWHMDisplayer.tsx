import React, { Component, PureComponent} from 'react';
import Log from '../shared/Log';
import * as BackendRequest from "../BackendRequest";
import CancellationToken from 'cancellationtoken';
import * as Algebra from '../shared/Algebra';
import { ProcessorStarFieldOccurence } from '@bo/ProcessorTypes';
import FitsMarker from './FitsMarker';

const logger = Log.logger(__filename);

export type Props = {
    path: string|null;
    streamId: string|null;
};

type RankedStar = ProcessorStarFieldOccurence & {
    fwhmRank: number;
}

export type State = {
    path: string|null;
    streamId: string|null;
    value: string|null;
    stars: Array<RankedStar>;
    maxStarRank: number;
    loading: boolean;
};

export default class FWHMDisplayer extends PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            path: null,
            streamId: null,
            value: null,
            loading: false,
            maxStarRank: 0,
            stars: [],
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

            let fwhm = Algebra.starFieldFwhm(e.stars);
            let stat;
            if (isNaN(fwhm)) {
                if (e.stars.length) {
                    stat = "All stars are saturated";
                } else {
                    stat = "No star found"
                }
                fwhm = 0;
            } else {
                stat = fwhm.toFixed(2) + " - " + e.stars.length + " stars"
            }

            const rankedStars = e.stars.map(e=>({fwhmRank:NaN, ...e}))

            const sortedStars = Algebra.starConsideredForFwhm(rankedStars).sort((a, b)=>a.fwhm < b.fwhm ? -1 : a.fwhm > b.fwhm ? 1 : 0) as Array<RankedStar>;
            for(let i = 0; i < sortedStars.length; ++i) {
                sortedStars[i].fwhmRank = i;
            }

            this.setState({
                value: stat,
                stars: rankedStars,
                maxStarRank: sortedStars.length,
                loading: false
            });
        } catch(e) {
            this.setState({
                value: "N/A " + (e.message || e),
                stars: [],
                maxStarRank: 0,
                loading: false
            });
        };
    }

    _cancelLoadData() {
        // Not implemented
        logger.warn('FIXME: canceling FWHMDisplayer is not implemented');
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
        const stars = [];
        let minFwhm : number, maxFwhm: number;
        for(let i = 0; i < this.state.stars.length; ++i) {
            const star = this.state.stars[i];
            if (i === 0) {
                minFwhm = star.fwhm;
                maxFwhm = star.fwhm;
            } else {
                minFwhm = Math.min(minFwhm!, star.fwhm);
                maxFwhm = Math.max(maxFwhm!, star.fwhm);
            }
        }

        const col = [
            [ 0,255 ],
            [ 0,0 ],
            [ 255,0 ],
        ];
        const rejectedCol = [ 128,128,96 ];

        for(let i = 0; i < 50 && i < this.state.stars.length; ++i) {
            const star = this.state.stars[i];
            let color;
            if (isNaN(star.fwhmRank)) {
                color = rejectedCol;
            } else {
                const fwhmFact = this.state.maxStarRank ? star.fwhmRank / this.state.maxStarRank : 0.5;
                color = col.map(e=>((1-fwhmFact) * e[0] + (fwhmFact) * e[1]));
            }

            const rgb="rgb(" + color.map(e=>"" + Math.round(e)).join(',') + ")";

            stars.push(<FitsMarker key={"s" + i} x={star.x} y={star.y}>
                <div className="FwhmStar" style={{borderColor: rgb}}>
                </div>
            </FitsMarker>);
        }
        return <>
            <div className='FitsSettingsOverlay'>
                {(this.state.value === null)
                    ?
                        this.state.loading
                        ?
                            <div>...</div>
                        :
                            <div>N/A</div>
                    :
                        <div>{this.state.value}</div>
                }
            </div>
            <div className='FitsViewMarkers'>{stars}</div>
        </>;
    }
}
