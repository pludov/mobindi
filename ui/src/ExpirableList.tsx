import * as React from 'react';
import * as Store from './Store';
import './NotificationContainer.css';
import Notification from './Notification';

type Props = {
    list: string[];
    delay: number;
    reverse?: boolean;
    render: (id:string, expired: boolean)=>React.ReactNode;
}


type State = {
    list: string[];
}

// Returns item from a that are not in b
function arrayDiff(a: string[], b: string[])
{
    if (b.length === 0 || a.length === 0) {
        return a;
    }

    const bKeys = {};
    for(const bk of b) {
        bKeys[bk] = true;
    }
    const result = [];
    for(const ak of a) {
        if (!Object.prototype.hasOwnProperty.call(bKeys, ak)) {
            result.push(ak);
        }
    }
    return result;
}

export default class ExpirableList extends React.PureComponent<Props, State> {

    timer: undefined|NodeJS.Timeout;
    timerTime: undefined|number;
    removalDate: {[id: string] : number};

    constructor(props:Props) {
        super(props);
        this.timer = undefined;
        this.timerTime = undefined;
        this.state = {
            list: []
        }
        this.removalDate = {};
    }

    public render() {
        const todo = {};
        for(const k of this.state.list) {
            todo[k] = false;
        }
        for(const k of this.props.list) {
            todo[k] = true;
        }

        let items = Object.keys(todo).sort();
        if (this.props.reverse) {
            items = items.reverse();
        }
        return <>
            {items.map((uuid)=><React.Fragment key={uuid}>{this.props.render(uuid, todo[uuid])}</React.Fragment>)}
        </>;
    }

    static getDerivedStateFromProps(props: Props, state: State) {
        const todo = {};
        for(const k of props.list) {
            todo[k] = true;
        }
        for(const k of state.list) {
            todo[k] = false;
        }
        const allList = Object.keys(todo).sort();
        if (allList.length !== state.list.length) {
            return {
                list: allList
            }
        }
        return null;
    }

    onExpire = ()=> {
        this.timer = undefined;
        this.timerTime = undefined;
        const now = new Date().getTime();
        const toRemove: string[] = [];
        for(const n of Object.keys(this.removalDate)) {
            if (this.removalDate[n] + this.props.delay <= now) {
                toRemove.push(n);
            }
        }

        if (!toRemove.length) {
            return;
        }
        const list = [...this.state.list];
        for(const r of toRemove) {
            delete this.removalDate[r];
            while(true) {
                const id = list.indexOf(r);
                if (id === -1) {
                    break;
                }
                list.splice(id, 1);
            }
        }

        this.setState({list: list});
    }

    componentDidUpdate(prevProps : Props, prevState : State) {
        // update removal date

        // Add timing info to item removed from props
        for(const droppedId of arrayDiff(prevProps.list, this.props.list)) {
            this.removalDate[droppedId] = new Date().getTime();
        }

        // remove deleted entries (not in new state)
        for(const id of arrayDiff(prevState.list, this.state.list)) {
            delete this.removalDate[id];
        }

        let nextTimeRequired:number|undefined = undefined;
        for(const k of Object.keys(this.removalDate)) {
            const t = this.removalDate[k] + this.props.delay;
            if (nextTimeRequired === undefined || t < nextTimeRequired) {
                nextTimeRequired = t;
            }
        }

        if (nextTimeRequired !== this.timerTime) {
            if (this.timer !== undefined) {
                clearTimeout(this.timer);
                this.timer = undefined;
                this.timerTime = undefined;
            }

            if (nextTimeRequired !== undefined) {
                this.timerTime = nextTimeRequired;
                const duration = Math.max(0, nextTimeRequired - new Date().getTime());

                this.timer = setTimeout(this.onExpire, duration);
            }
        }
    }

}

