import CancellationToken from 'cancellationtoken';
import * as BackOfficeAPI from "./shared/BackOfficeAPI";

export interface RequestGenerator<T> {
    stream:(t:T)=>Promise<void>
}

export interface RequestControl {
    setInterruptible:(b:boolean)=>void;
}

export type APIFunctionImplementor<Func> =
    Func extends ((payload: infer FROM)=>(BackOfficeAPI.AsyncStream<infer TO>))
        ? (ct: CancellationToken, payload : FROM, ctrl: RequestGenerator<TO> & RequestControl)=>Promise<void>
        : Func extends ((payload: infer FROM)=>(infer TO))
            ? (ct: CancellationToken, payload : FROM, ctrl: RequestControl)=>Promise<TO>
            : never;

export type APIAppImplementor<API> = {
    [P in keyof API]: APIFunctionImplementor<API[P]>;
}

export type APIAppProvider<API> = APIAppImplementor<API> & {
    getAPI:()=>APIAppImplementor<API>;
}

export type APIImplementor = {
    [P in keyof BackOfficeAPI.BackOfficeAPI]: APIAppImplementor<BackOfficeAPI.BackOfficeAPI[P]>
};
