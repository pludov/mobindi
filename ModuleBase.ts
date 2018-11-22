import {Application as ExpressApplication} from "express-serve-static-core";

import Camera from './Camera';
import Astrometry from './Astrometry';
import IndiManager from "./IndiManager";
import ImageProcessor from "./ImageProcessor";

export type ExpressApplication = ExpressApplication;

export type AppContext = {
    imageProcessor: ImageProcessor;
    phd: any;
    indiManager: IndiManager;
    camera: Camera;
    triggerExecuter: any;
    toolExecuter: any;
    focuser: any;
    astrometry: Astrometry;
};

