import CancellationToken from 'cancellationtoken';
import * as BackOfficeAPI from "@bo/BackOfficeAPI";
import * as ProcessorTypes from "@bo/ProcessorTypes";
import * as Store from "./Store";


type Invoker<Func> =
    Func extends ((payload: infer FROM)=>(infer TO))
        ? (ct: CancellationToken, payload : FROM)=>Promise<TO>
        : never;

type AppInvoker<TYPE> =
    <ID extends keyof TYPE>(id: ID)=> Invoker<TYPE[ID]>;


type Streamer<Func> =
    Func extends ((payload: infer FROM)=>BackOfficeAPI.AsyncStream<(infer TO)>)
        ? (payload: FROM) => ReadableStream<TO>
        : never;

type AppStreamer<TYPE> =
    <ID extends keyof TYPE>(id: ID)=> Streamer<TYPE[ID]>;

async function privateCall(ct: CancellationToken, appId: string, methodId: string, payload:any):Promise<any> {
    return await Store.getNotifier().sendRequest({
        _app: appId,
        _func: methodId,
        payload
    }, 'api');
}

// Usage: RootInvoker("toolExecuter")("startTool")(CancellationToken.CONTINUE, {uid: ""});
export function RootInvoker<ID extends keyof BackOfficeAPI.BackOfficeAPI>(appId:ID):AppInvoker<BackOfficeAPI.BackOfficeAPI[ID]> {
    return  ((methodId: string)=>{
        return (ct: CancellationToken, payload: any)=>privateCall(ct, appId, methodId, payload);
    }) as any;
}

export function ImageProcessor<K extends keyof ProcessorTypes.Request>
                    (
                        ct:CancellationToken,
                        payload: Pick<ProcessorTypes.Request, K>
                    ) : Promise<ProcessorTypes.Result[K]>
{
    return RootInvoker("imageProcessor")("compute")(ct, payload as any) as any;
}


function privateStream(appId: string, methodId: string, payload: any):ReadableStream<any> {
    let cancellationMethod: undefined | (()=>void);
    return new ReadableStream({
        async start(controller) {
            try {
                cancellationMethod = Store.getNotifier().startStream({
                    requestData: {
                        _app: appId,
                        _func: methodId,
                        payload,
                    },
                    type: 'api',
                    resolve: controller.close.bind(controller),
                    reject: controller.error.bind(controller),
                    onItem: controller.enqueue.bind(controller),
                });
            } catch(e) {
                controller.error(e);
            }
        },

        async cancel(reason) {
            if (cancellationMethod) {
                cancellationMethod();
            }
        }
    });
}

// Usage: RootStreamer("toolExecuter")("startTool")({uid: ""});
export function RootStreamer<ID extends keyof BackOfficeAPI.BackOfficeAPI>(appId:ID):AppStreamer<BackOfficeAPI.BackOfficeAPI[ID]> {
    return  ((methodId: string)=>{
        return (payload: any)=>privateStream(appId, methodId, payload);
    }) as any;
}

