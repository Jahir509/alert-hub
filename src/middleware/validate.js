import { ValidationError } from '../utils/error.js';


export const validate = (schema,source='body') => (req,_res,next)=>{
    const result = schema.safeParse(req[source]) ?? {};

    if(!result.success){
        throw new ValidationError(result.error.issues);
    }
    
    req[source] = result.data;
    next();
}