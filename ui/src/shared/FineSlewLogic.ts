import { FineSlewStatus, FineSlewLearning} from '@bo/BackOfficeStatus';


export function fineTuneCanLearn(status: FineSlewStatus, currentImagingSetup: string) {
    return (!status.slewing
            && status.learning === null);
}

export function fineTuneCanSlew(status: FineSlewStatus, currentImagingSetup: string) {
    return (!status.slewing
            && status.learning === null
            && status.learned !== null
            && status.learned.imagingSetup === currentImagingSetup);
}

export function fineTuneIsLearning(status: FineSlewStatus, currentImagingSetup: string) : FineSlewLearning | null{
    if (status.learning !== null && status.learning.imagingSetup === currentImagingSetup) {
        return status.learning;
    }
    return null;
}

