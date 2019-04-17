import * as React from 'react';


/**
 * Created by ludovic on 25/07/17.
 */
export default class BaseApp {
    readonly appId: string;

    constructor(appId: string) {
        this.appId = appId;
    }

    getAppId() {
        return this.appId;
    }

    getUi():null|React.ReactNode {
        return null;
    }
}
