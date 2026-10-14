import { Request, Response } from "express";
import { listAdminPayments, adminRefundPayment } from "./finance.service";
import { prisma } from "../../core/prisma";
import { createDriverPayout } from "../provider/payout.service";

function int(v:unknown,d:number,max:number){const n=Number(v);return Number.isInteger(n)&&n>0?Math.min(n,max):d;}
function date(v:unknown){if(typeof v!=="string"||!v)return undefined;const d=new Date(v);return Number.isNaN(d.getTime())?undefined:d;}
function fail(res:Response,req:Request,e:unknown){const code=e instanceof Error?e.message:"INTERNAL_ERROR";const map:any={PAYMENT_NOT_FOUND:[404,"Payment not found"],REFUND_PROVIDER_UNSUPPORTED:[409,"Payment provider does not support admin refunds"],PAYMENT_NOT_REFUNDABLE:[409,"Payment is not refundable"],PAYMENT_PROVIDER_ID_MISSING:[409,"Provider payment id is missing"],REFUND_ALREADY_PROCESSING:[409,"A refund is already processing"],INVALID_REFUND_AMOUNT:[400,"Invalid refund amount"],RAZORPAY_NOT_CONFIGURED:[503,"Razorpay is not configured"],RAZORPAY_REFUND_FAILED:[502,"Razorpay refund failed"],PAYOUT_ACCOUNT_NOT_READY:[409,"Driver payout account is not ready"],PAYOUT_PROVIDER_NOT_CONFIGURED:[503,"Provider payouts are disabled until an approved payout provider/process is configured"],RAZORPAYX_NOT_CONFIGURED:[503,"RazorpayX payouts are not configured"],RAZORPAYX_REQUEST_FAILED:[502,"RazorpayX payout request failed"],INVALID_PAYOUT_AMOUNT:[400,"Invalid payout amount"]};const [status,message]=map[code]??[500,"Internal server error"];return res.status(status).json({success:false,data:null,error:{code,message},requestId:req.requestId});}
export async function listAdminPaymentsController(req:Request,res:Response){const from=date(req.query.from),to=date(req.query.to);if(req.query.from&&!from||req.query.to&&!to)return res.status(400).json({success:false,error:{code:"INVALID_DATE_RANGE",message:"Invalid date range"},requestId:req.requestId});if(from&&to&&from>to)return res.status(400).json({success:false,error:{code:"INVALID_DATE_RANGE",message:"from must be before to"},requestId:req.requestId});try{const data=await listAdminPayments({page:int(req.query.page,1,100000),limit:int(req.query.limit,25,100),status:typeof req.query.status==="string"?req.query.status.toUpperCase():undefined,provider:typeof req.query.provider==="string"?req.query.provider.toUpperCase():undefined,search:typeof req.query.search==="string"?req.query.search.trim():undefined,from,to});return res.json({success:true,data,error:null,requestId:req.requestId});}catch(e){return fail(res,req,e);}}
export async function refundAdminPaymentController(req:Request,res:Response){const paymentId=String(req.params.id||"");const reason=typeof req.body?.reason==="string"?req.body.reason.trim():"";const amount=req.body?.amount===undefined?undefined:Number(req.body.amount);if(!paymentId||reason.length<2||reason.length>500||(amount!==undefined&&(!Number.isFinite(amount)||amount<=0)))return res.status(400).json({success:false,error:{code:"VALIDATION_ERROR",message:"Valid reason and optional positive amount are required"},requestId:req.requestId});try{const data=await adminRefundPayment(paymentId,req.user!.id,{amount,reason},req.requestId);return res.status(201).json({success:true,data,error:null,requestId:req.requestId});}catch(e){return fail(res,req,e);}}


export async function getFinanceSummary(req: Request, res: Response) {
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) return res.status(400).json({ success:false, error:{code:"INVALID_DATE_RANGE",message:"Invalid date range"},requestId:req.requestId });
  if (from && to && from > to) return res.status(400).json({ success:false,error:{code:"INVALID_DATE_RANGE",message:"from must be before to"},requestId:req.requestId });
  const where:any={createdAt:{...(from?{gte:from}:{}),...(to?{lte:to}: {})}};
  const [payments,successful,refunded,failed]=await Promise.all([
    prisma.payment.aggregate({where,_count:true,_sum:{amount:true}}),
    prisma.payment.aggregate({where:{...where,status:"CAPTURED"},_count:true,_sum:{amount:true}}),
    prisma.payment.aggregate({where:{...where,status:"REFUNDED"},_count:true,_sum:{amount:true}}),
    prisma.payment.aggregate({where:{...where,status:"FAILED"},_count:true,_sum:{amount:true}})
  ]);
  return res.json({success:true,data:{period:{from:from?.toISOString()??null,to:to?.toISOString()??null},totals:{count:payments._count,amount:payments._sum.amount??0},captured:{count:successful._count,amount:successful._sum.amount??0},refunded:{count:refunded._count,amount:refunded._sum.amount??0},failed:{count:failed._count,amount:failed._sum.amount??0}},error:null,requestId:req.requestId});
}

export async function createDriverPayoutController(req: Request, res: Response) {
  const driverId = String(req.params.driverId || "");
  const amount = Number(req.body?.amount);
  const rideId = typeof req.body?.rideId === "string" ? req.body.rideId : undefined;
  if (!driverId || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success:false, data:null, error:{code:"VALIDATION_ERROR",message:"Valid driverId and positive amount are required"}, requestId:req.requestId });
  }
  try {
    const data = await createDriverPayout(driverId, amount, rideId);
    return res.status(201).json({ success:true, data, error:null, requestId:req.requestId });
  } catch (e) {
    return fail(res, req, e);
  }
}
