import CancellationToken from "cancellationtoken";


export default async function Sleep(ct: CancellationToken, timeout:number):Promise<void>
{
    ct.throwIfCancelled();

    return new Promise((resolve, reject) => {
        let timeObj:NodeJS.Timeout|undefined = setTimeout(()=> {
            cleanup();
            resolve();
        }, timeout);

        let unregisterCt:undefined|(()=>void) = ct.onCancelled((reason)=> {
            cleanup();
            reject(new CancellationToken.CancellationError(reason));
        });

        const cleanup = ()=> {
            if (timeObj !== undefined) {
                clearTimeout(timeObj);
                timeObj = undefined;
            }
            if (unregisterCt !== undefined) {
                unregisterCt();
                unregisterCt = undefined;
            }
        }
    });
}

