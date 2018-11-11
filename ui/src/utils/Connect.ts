import * as React from "react";
import { connect as reduxConnect } from 'react-redux'

/**
 * Typescript aware wrapper around redux connect
 */

interface WrappedComponent<T> {
    getWrappedInstance():T;
}

type mapStateToPropsDirectFunc<TOwnProps, State, TStateProps> = (state: State, ownProps: TOwnProps)=>TStateProps;

interface IMapStateToProps<TOwnProps, State, TStateProps> {
    mapStateToProps : mapStateToPropsDirectFunc<TOwnProps, State, TStateProps> | (()=>(mapStateToPropsDirectFunc<TOwnProps, State, TStateProps>));
}

export function Connect<Class, TOwnProps, State, TStateProps >(
            ctor : (new (props:TOwnProps)=>(React.PureComponent<TOwnProps,State>))&IMapStateToProps<TOwnProps,State, TStateProps>
        )
            : new (props:TOwnProps)=>(React.PureComponent<TOwnProps,State> & WrappedComponent<Class>)
{
    return reduxConnect(ctor.mapStateToProps, null, null, {withRef:true})(ctor as any) as any;
}

