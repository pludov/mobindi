import * as Utils from '../Utils';

export function mapMemoize<T>(computer: (key: string)=>T) : (keys: Array<string>)=>{[key: string]: T} {

    let previous: {[key:string]: T} = {}

    return (keysArr: Array<string>) => {
        let changed: boolean = false;

        let keys : {[id: string]: boolean} = {};

        let next = {...previous};

        // Add new keys
        for(const k of keysArr) {
            if (!Utils.has(next, k)) {
                next[k] = computer(k);
                changed = true;
            }
            keys[k] = true;
        }

        // Remove missings
        for(const k of Object.keys(previous)) {
            if (!Utils.has(keys, k)) {
                delete next[k];
                changed = true;
            }
        }

        // Remove old ones
        if (!changed) {
            next = previous;
        } else {
            previous = next;
        }
        // If change, return a new object
        // Else return previous
        return next;
    }
}

