export default class PhdRpcError extends Error {
    public readonly method: string;
    public readonly err: any;
    constructor(method:string, err: any) {
        super(err.message ? method + ": " + err.message : method + ": failed");

        // Ensure the name of this error is the same as the class name
        this.name = this.constructor.name;
        // This clips the constructor invocation from the stack trace.
        // It's not absolutely essential, but it does make the stack trace a little nicer.
        //  @see Node.js reference (bottom)
        Error.captureStackTrace(this, this.constructor);

        this.method = method;
        this.err = err;
    }
}
