import { IndiProfileConfiguration } from "@bo/BackOfficeStatus";



export type StateFilter = {
    key: string,
    value: string|undefined,
}

export type SetStateFilter = {
    key: string,
    value: string
}


export function getIdentifierListFromFilter(filter: IndiProfileConfiguration['systemDeviceIdentifier']):Array<SetStateFilter> {
    const src = filter || {};
    const keys = Object.keys(src);
    keys.sort();

    return keys.map( k => ({key: k, value: src[k]}));
}