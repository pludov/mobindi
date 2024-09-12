
export type FailedAstrometryResult = {
    found: false;
}

export type SucceededAstrometryResult = {
    found: true;
    raCenter: number;
    decCenter: number;
    refPixX: number;
    refPixY: number;
    cd1_1: number;
    cd1_2: number;
    cd2_1: number;
    cd2_2: number;
    //frame pixel size (verbatim from input)
    width: number;
    height: number;
}

export type AstrometryResult = FailedAstrometryResult|SucceededAstrometryResult;

export type ProcessorContentRequest = {
    path: string;
    streamId: string;
}

export type ProcessorStarFieldRequest = {
    source: ProcessorContentRequest;
}

export type ProcessorStarFieldOccurence = {
    fwhm: number;
    peak:number;
    sat:boolean;
    x:number;
    y:number;
}

export type ProcessorStarFieldResult = {
    stars: Array<ProcessorStarFieldOccurence>;
}

export type ProcessorAstrometryConstraints = {
    fieldMin: number;
    fieldMax: number;
    raCenterEstimate: number;
    decCenterEstimate: number;
    searchRadius: number;
}

export type ProcessorAstrometryRequest = ProcessorAstrometryConstraints & {
    exePath: string;
    libraryPath: string;
    numberOfBinInUniformize: 10;
    source: ProcessorStarFieldRequest;
}

export type ProcessorHistogramRequest = {
    source: ProcessorContentRequest;
}

export type ProcessorHistogramOptions = {maxBits: number};
export type ProcessorHistogramChannel = {min: number, max:number, pixcount: number, bitpix: number, identifier: string, data: Array<number>};
export type ProcessorHistogramResult = Array<ProcessorHistogramChannel>;

export type ProcessorAstrometryResult = AstrometryResult;

export type Order<Req, Res, Options> = {
    req: Req,
    res: Res,
    options: Options,
};

type OrderRequest<ORDER> = ORDER extends Order<infer Req, any, any> ? Req : never;
type OrderOptions<ORDER> = ORDER extends Order<any, any, infer Options> ? Options : never;
type OrderResult<ORDER> = ORDER extends Order<any, infer Res, any> ? Res : never;

export type Astrometry = Order<ProcessorAstrometryRequest, ProcessorAstrometryResult, void>;

export type StarField = Order<ProcessorStarFieldRequest, ProcessorStarFieldResult, void>;

export type Histogram = Order<ProcessorHistogramRequest, ProcessorHistogramResult, ProcessorHistogramOptions>;

type Registry = {
    astrometry: Astrometry,
    starField: StarField,
    histogram: Histogram,
}

export type Request = {
    [k in keyof Registry]: OrderRequest<Registry[k]> | { options?: OrderOptions<Registry[k]> }
}

export type Result = {
    [k in keyof Registry]: OrderResult<Registry[k]>
}
