import * as Store from './Store';
import * as BackendRequest from "./BackendRequest";
import CancellationToken from 'cancellationtoken';

import { BackendAccessorImpl } from './utils/BackendAccessor';
import * as Accessor from './utils/AccessPath';
import { defaultMemoize } from 'reselect';

class CurrentImagingSetupAccessor implements Store.Accessor<string|null> {
    fromStore = (store:Store.Content)=> {
        const ret = store.backend?.focuser?.currentImagingSetup;
        if (ret === undefined) return null;
        return ret;
    }

    send = async (imagingSetup: string|null) => {
        await BackendRequest.RootInvoker("focuser")("setCurrentImagingSetup")(
            CancellationToken.CONTINUE,
            {
                imagingSetup
            }
        );
    }
}

export const currentImagingSetupAccessor = defaultMemoize(()=>new CurrentImagingSetupAccessor());

