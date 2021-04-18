import { BackendAccessorImpl, RecursiveBackendAccessor } from './utils/BackendAccessor';
import * as BackendRequest from "./BackendRequest";
import CancellationToken from 'cancellationtoken';
import { AstrometrySettings } from '@bo/BackOfficeStatus';
import * as AccessPath from './utils/AccessPath';

// FIXME: move to AstrometryStore
export default class AstrometryBackendAccessor extends BackendAccessorImpl<AstrometrySettings> {
    constructor() {
        super(AccessPath.For((e)=>e.astrometry!.settings));
    }

    public apply = async (jsonDiff:any):Promise<void>=>{
        await BackendRequest.RootInvoker("astrometry")("updateCurrentSettings")(
            CancellationToken.CONTINUE,
            {diff: jsonDiff}
        );
    }
}
