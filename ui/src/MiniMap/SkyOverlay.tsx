import React from 'react';
import * as Store from '../Store';
import * as IndiStore from '../IndiStore';
import { Location, locationShiftExceedsMinute, SkyPaths, SkyProjector, validLocation } from './projection';

type InputProps = { device: string };
type MappedProps = { lat?: number; long?: number };
type Props = InputProps & MappedProps;
type State = { paths?: SkyPaths };

let nextClipId = 0;

export class SkyOverlay extends React.PureComponent<Props, State> {
    state: State = {};
    private projector = new SkyProjector();
    private renderedLocation?: Location;
    private timer?: ReturnType<typeof setInterval>;
    private readonly clipId = `minimap-sky-clip-${nextClipId++}`;

    componentDidMount() {
        document.addEventListener('visibilitychange', this.onVisibilityChange);
        this.updateVisibility();
    }

    componentDidUpdate(previous: Props) {
        if (previous.lat !== this.props.lat || previous.long !== this.props.long || previous.device !== this.props.device) {
            const location = this.location();
            if (!location) {
                this.stopTimer();
                this.renderedLocation = undefined;
                if (this.state.paths) this.setState({ paths: undefined });
            } else if (!document.hidden) {
                if (!this.renderedLocation || locationShiftExceedsMinute(this.renderedLocation, location)) {
                    this.refresh();
                }
                this.startTimer();
            }
        }
    }

    componentWillUnmount() {
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
        this.stopTimer();
    }

    private location(): Location | undefined {
        return this.props.device ? validLocation(this.props.lat, this.props.long) : undefined;
    }

    private refresh = () => {
        const location = this.location();
        if (!location || document.hidden) return;
        const paths = this.projector.project(location, Date.now());
        this.renderedLocation = location;
        this.setState({ paths });
    }

    private startTimer() {
        if (this.timer === undefined) this.timer = setInterval(this.refresh, 60000);
    }

    private stopTimer() {
        if (this.timer !== undefined) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    private updateVisibility() {
        if (document.hidden || !this.location()) {
            this.stopTimer();
        } else {
            this.refresh();
            this.startTimer();
        }
    }

    private onVisibilityChange = () => this.updateVisibility();

    render() {
        if (!this.state.paths || !this.location()) return null;
        return <svg data-testid="sky-overlay" className="MiniMapSky e2e-hide" viewBox="0 0 1 1" aria-hidden="true" focusable="false">
            <defs><clipPath id={this.clipId}><circle cx="0.5" cy="0.5" r="0.5" /></clipPath></defs>
            <g clipPath={`url(#${this.clipId})`}>
                <path className="MiniMapSkyLines" d={this.state.paths.lines} />
                {this.state.paths.stars.map((path, i) => <path className="MiniMapSkyStars" d={path} key={i} />)}
            </g>
        </svg>;
    }

    static mapStateToProps(store: Store.Content, props: InputProps): MappedProps {
        return IndiStore.getMountGeoCoords(store, props.device) || {};
    }
}

export default Store.Connect(SkyOverlay);
