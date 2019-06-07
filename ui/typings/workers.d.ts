// typings/custom.d.ts
declare module "worker-loader!*" {
    class WebpackWorker extends SharedWorker {
      constructor();
    }

    export default WebpackWorker;
}

declare module "shared-worker-loader!*" {
    class WebpackWorker extends SharedWorker {
      constructor(name?:string);
    }

    export default WebpackWorker;
}