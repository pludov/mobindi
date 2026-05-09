import { EventEmitter } from 'events';
import { IImageLoader, ImageLoaderExposure, ImageLoaderParam } from './ImageLoader';
import { ImageDetails } from './Types';

/**
 * Loader used while waiting for image details to exist in the store.
 * It intentionally never reaches sized/rendered states and stays loading.
 */
export class ForeverLoader implements IImageLoader {
    param: ImageLoaderParam;
    exposure: ImageLoaderExposure | undefined;
    frameDetails: ImageDetails | null = null;
    events: EventEmitter = new EventEmitter();
    root: HTMLSpanElement;

    constructor(param: ImageLoaderParam) {
        this.param = param;
        this.root = document.createElement('span');
    }

    samePath(other: IImageLoader): boolean {
        return this.param.path === other.param.path;
    }

    sameGeometry(other: IImageLoader): boolean {
        return this.frameDetails !== null
            && other.frameDetails !== null
            && this.frameDetails.width === other.frameDetails.width
            && this.frameDetails.height === other.frameDetails.height;
    }

    prepare(_previousLoader?: IImageLoader): void {
        // Intentionally unresolved: the display keeps its current state + spinner.
    }

    dispose(): void {
        if (this.root.parentNode != null) {
            this.root.parentNode.removeChild(this.root);
        }
    }

    abortLoading(): void {
        // Nothing to cancel.
    }

    expose(_exposure: ImageLoaderExposure): void {
        // No renderable content.
    }

    hadLoadingError(): boolean {
        return false;
    }

    isLoading(): boolean {
        return true;
    }
}
