import CancellationToken from 'cancellationtoken';
import * as BackOfficeAPI from "./shared/BackOfficeAPI";

export type APIFunctionImplementor<Func> =
    Func extends ((payload: infer FROM)=>(infer TO))
        ? (ct: CancellationToken, payload : FROM)=>Promise<TO>
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
