
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
}

export type ProcessorStarFieldRequest = {
    source: ProcessorContentRequest;
}

export type ProcessorStarFieldResult = {
    stars: Array<{fwhm: number}>;
}

export type ProcessorAstrometryRequest = {
    exePath: string;
    libraryPath: string;
    fieldMin: number;
    fieldMax: number;
    raCenterEstimate: number;
    decCenterEstimate: number;
    searchRadius: number;
    numberOfBinInUniformize: 10;
    source: ProcessorStarFieldRequest;
}

export type ProcessorAstrometryResult = AstrometryResult;

export type Order<Req, Res> = {
    req: Req,
    res: Res,
};

type OrderRequest<ORDER> = ORDER extends Order<infer Req, any> ? Req : never;
type OrderResult<ORDER> = ORDER extends Order<any, infer Res> ? Res : never;

export type Astrometry = Order<ProcessorAstrometryRequest, ProcessorAstrometryResult>;

export type StarField = Order<ProcessorStarFieldRequest, ProcessorStarFieldResult>;

type Registry = {
    astrometry: Astrometry,
    starField: StarField,
}

export type Request = {
    [k in keyof Registry]: OrderRequest<Registry[k]>
}

export type Result = {
    [k in keyof Registry]: OrderResult<Registry[k]>
}
