import * as Store from './Store';

// Move to a Store class
export const getImagingSetup = (store:Store.Content, imagingSetup: string|null)=> {
    if (imagingSetup === null) {
        return null;
    }
    const byuuid = store.backend?.imagingSetup?.configuration.byuuid;
    if (byuuid === undefined) {
        return null;
    }

    if (!Object.prototype.hasOwnProperty.call(byuuid, imagingSetup)) {
        return null;
    }

    return byuuid[imagingSetup];
}

