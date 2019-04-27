import BackendAccessor from './utils/BackendAccessor';
import * as BackendRequest from "./BackendRequest";
import CancellationToken from 'cancellationtoken';
import { AstrometrySettings } from '@bo/BackOfficeStatus';

export default class AstrometryBackendAccessor extends BackendAccessor<AstrometrySettings> {
    public apply = async (jsonDiff:any):Promise<void>=>{
        console.log('Sending changes: ' , jsonDiff);
        await BackendRequest.RootInvoker("astrometry")("updateCurrentSettings")(
            CancellationToken.CONTINUE,
            {diff: jsonDiff}
        );
    }
}
