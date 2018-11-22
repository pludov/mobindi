import {Application as ExpressApplication} from "express-serve-static-core";

import Camera from './Camera';
import Astrometry from './Astrometry';

export type ExpressApplication = ExpressApplication;

export type AppContext = {
    imageProcessor: any;
    phd: any;
    indiManager: any;
    camera: Camera;
    triggerExecuter: any;
    toolExecuter: any;
    focuser: any;
    astrometry: Astrometry;
};

