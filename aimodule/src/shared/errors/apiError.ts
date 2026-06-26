
export class ApiError extends Error{

    public readonly statusCode:number;
    public readonly isOperational:boolean;
    public errors:unknown[];

    constructor(statusCode:number,message:string,isOperational=true,errors:unknown[]= []){
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.errors = errors;
        Object.setPrototypeOf(this,ApiError.prototype);
    }

    static notFound(msg="not Found"){ return new ApiError(404 , msg) }
    static forbidden(msg="forbidden"){ return new ApiError(403 , msg) }
    static unauthorized(msg="unauthorized"){ return new ApiError(401 , msg) }
    static conflict(msg="resource conflict"){ return new ApiError(409 , msg) }
    static badRequest(msg="bad Request", error?:unknown[]){ return new ApiError(400 , msg , true , error) }
    static tooManyRequests(msg="Too Many Requests", error?:unknown[]){ return new ApiError(429 , msg , true , error) }
    static internalServerError(msg="internal Server Error", error?:unknown[]){ return new ApiError(500 , msg , true , error) }
    
    // if an error is related to AI Provider quota or rate limits
    static isQuotaError(error: any): boolean {
        if (!error) return false;
        const errMsg = (error.message || '').toLowerCase();
        const code = error.code || error.status || error.statusCode;
        return code === 429 || errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('resource_exhausted') || errMsg.includes('rate limit');
    }

    //  if an error is an Opossum Circuit Breaker Open Error
    static isCircuitBreakerOpen(error: any): boolean {
        return error?.code === 'EOPEN' || (error?.message || '').includes('Circuit breaker is open');
    }
}

// job timeout error
export class JobTimeoutError extends ApiError {
    public readonly jobId: string;
    
    constructor(jobId: string, message: string = 'Job processing timeout') {
        super(408, message, true);
        this.jobId = jobId;
        Object.setPrototypeOf(this, JobTimeoutError.prototype);
    }
}

// queue overloaded error
export class QueueOverloadedError extends ApiError {
    public readonly retryAfterSeconds: number;
    constructor(message: string = 'Service is temporarily overloaded. Please try again later.', retryAfterSeconds = 30) {
        super(503, message, true);
        this.retryAfterSeconds = retryAfterSeconds;
        Object.setPrototypeOf(this, QueueOverloadedError.prototype);
    }
}