import CancellationToken from "cancellationtoken";
import {createTask} from "./Task.js";


export default async function Timeout<T>(ct: CancellationToken, code: (ct:CancellationToken)=>Promise<T>, timeout:number, errorProvider:()=>Error)
{
    ct.throwIfCancelled();

    return await createTask(ct, async (task)=> {
        let expired : boolean = false;
        let timeObj:NodeJS.Timeout|undefined = setTimeout(()=> {
            timeObj = undefined;
            expired = true;
            task.cancel();
        }, timeout);
        try {
            return await code(task.cancellation);
        } catch(e) {
            if (e instanceof CancellationToken.CancellationError && !ct.isCancelled && expired) {
                // Cancelation on our side.
                throw errorProvider();
            }
            throw e;
        } finally {
            if (timeObj !== undefined) {
                clearTimeout(timeObj);
            }
        }
    });
}