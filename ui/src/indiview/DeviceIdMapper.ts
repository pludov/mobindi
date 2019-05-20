import * as React from "react";
import { connect as reduxConnect } from 'react-redux'
import { atPath } from '../shared/JsonPath';
import * as Store from "../Store";

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

type BaseInput = {
    deviceId: string|null;
}

type PathBasedInput = {
    activePath: string;
}

export function forActivePath<TOwnProps extends BaseInput>(
        ctor: (new (props:TOwnProps)=>(React.PureComponent<TOwnProps>))
    )
        : new (props:Omit<TOwnProps, "deviceId">&PathBasedInput)=>(React.PureComponent<Omit<TOwnProps, "deviceId">&PathBasedInput>)
{
    return reduxConnect((state:Store.Content, t: Omit<TOwnProps, "deviceId">&PathBasedInput)=> {
        const {activePath, ...rest} = t;
        const deviceId = atPath(state, activePath);
        if (deviceId === null || deviceId === undefined) {
            return {
                ...rest,
                deviceId: null
            }
        }
        return {
            ...rest,
            deviceId
        };
    }, null, null, {forwardRef:true} as any)(ctor as any) as any;
}
