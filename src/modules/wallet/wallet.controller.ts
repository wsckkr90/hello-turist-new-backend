import type { Request, Response } from "express";
import { errorResponse, successResponse } from "../../core/api-response";
import { adRewardSchema, createRedeemCodeSchema, redeemSchema, walletConfigSchema } from "./wallet.schema";
import { buyMonthlyPass,getConfig,getWallet,listRedeemCodes,redeemCode,registerDevice,rewardAdView,updateConfig,createRedeemCode,verifyAdMobSsvAndReward } from "./wallet.service";
import { createMonthlyPassOrder, verifyMonthlyPassPayment } from "./monthly-pass-payment.service";
function fail(res:Response,id:string,e:unknown){const code=e instanceof Error?e.message:"INTERNAL_ERROR";const map:Record<string,[number,string]>={RAZORPAY_NOT_CONFIGURED:[503,"Razorpay is not configured"],RAZORPAY_AUTH_FAILED:[503,"Razorpay authentication failed"],RAZORPAY_REQUEST_FAILED:[502,"Razorpay request failed"],RAZORPAY_ORDER_INVALID:[502,"Razorpay returned an invalid order"],MONTHLY_PASS_FARE_INVALID:[400,"Could not calculate fare for this route"],MONTHLY_PASS_AMOUNT_INVALID:[400,"Calculated monthly pass amount is invalid"],MONTHLY_PASS_ORDER_NOT_FOUND:[404,"Monthly pass order not found"],FORBIDDEN:[403,"You do not have access to this order"],PAYMENT_AMOUNT_MISMATCH:[409,"Payment amount does not match the order"],RAZORPAY_SIGNATURE_INVALID:[401,"Invalid Razorpay payment signature"],PAYMENT_NOT_SUCCESSFUL:[409,"Razorpay payment is not captured"],MONTHLY_PASS_PAYMENT_NOT_PENDING:[409,"Monthly pass payment is not pending"],AD_ALREADY_REWARDED:[409,"This ad impression has already been rewarded"],REDEEM_DISABLED:[403,"Wallet redemption is currently disabled"],INVALID_REDEEM_CODE:[404,"Invalid redeem code"],CODE_ALREADY_REDEEMED:[409,"Redeem code already used"],CODE_EXPIRED:[410,"Redeem code expired"],INSUFFICIENT_COINS:[409,"Insufficient coins"],REDEEM_THRESHOLD_NOT_MET:[409,"Redeem threshold not met"],MONTHLY_PASS_DISABLED:[403,"Monthly pass codes are disabled"],COIN_COST_REQUIRED:[400,"coinCost is required"],PASS_MONTHS_REQUIRED:[400,"passMonths is required"],INVALID_ADMOB_SSV:[400,"Invalid AdMob server-side verification request"],ADMOB_KEYS_UNAVAILABLE:[503,"AdMob verifier keys are temporarily unavailable"],ADMOB_KEY_NOT_FOUND:[401,"Unknown AdMob verifier key"],INVALID_ADMOB_SIGNATURE:[401,"Invalid AdMob server-side verification signature"],INVALID_AD_REWARD_AMOUNT:[400,"Invalid ad reward amount"],AD_REWARD_AMOUNT_MISMATCH:[409,"Ad reward amount does not match server configuration"],INVALID_AD_TRANSACTION_ID:[400,"Invalid AdMob transaction id"]};const [status,message]=map[code]??[500,"Internal server error"];return errorResponse(res,id,status,code,message)}
export async function walletController(req:Request,res:Response){try{return successResponse(res,req.requestId,await getWallet(req.user!.id))}catch(e){return fail(res,req.requestId,e)}}
export async function rewardAdController(req:Request,res:Response){const p=adRewardSchema.safeParse(req.body);if(!p.success)return errorResponse(res,req.requestId,400,"VALIDATION_ERROR","Invalid ad reward request",p.error.flatten());try{return successResponse(res,req.requestId,await rewardAdView(req.user!.id,p.data),201)}catch(e){return fail(res,req.requestId,e)}}
export async function rewardAdMobSsvController(req:Request,res:Response){
  const rawQuery=(req.originalUrl.split("?",2)[1]??"").trim();
  const q=req.query as Record<string,string|undefined>;
  const userId=typeof q.custom_data==="string"?q.custom_data.trim():"";
  const transactionId=typeof q.transaction_id==="string"?q.transaction_id.trim():"";
  const rewardItem=typeof q.reward_item==="string"?q.reward_item.trim():"";
  const rewardAmount=Number(q.reward_amount);
  try{
    if(!userId||!transactionId||!rewardItem||!Number.isFinite(rewardAmount))throw new Error("INVALID_ADMOB_SSV");
    const data=await verifyAdMobSsvAndReward({rawQuery,signature:String(q.signature??""),keyId:String(q.key_id??""),userId,transactionId,rewardAmount,rewardItem});
    return successResponse(res,req.requestId,{verified:true,data});
  }catch(e){return fail(res,req.requestId,e)}
}
export async function redeemController(req:Request,res:Response){const p=redeemSchema.safeParse(req.body);if(!p.success)return errorResponse(res,req.requestId,400,"VALIDATION_ERROR","Invalid redeem code",p.error.flatten());try{return successResponse(res,req.requestId,await redeemCode(req.user!.id,p.data.code))}catch(e){return fail(res,req.requestId,e)}}
export async function buyMonthlyPassController(req:Request,res:Response){try{return successResponse(res,req.requestId,await buyMonthlyPass(req.user!.id))}catch(e){return fail(res,req.requestId,e)}}
export async function registerDeviceController(req:Request,res:Response){const token=typeof req.body?.token==="string"?req.body.token.trim():"";if(token.length<20||token.length>4096)return errorResponse(res,req.requestId,400,"VALIDATION_ERROR","Invalid FCM token");try{return successResponse(res,req.requestId,await registerDevice(req.user!.id,token),201)}catch(e){return fail(res,req.requestId,e)}}
export async function getWalletConfigController(req:Request,res:Response){try{return successResponse(res,req.requestId,await getConfig())}catch(e){return fail(res,req.requestId,e)}}
export async function updateWalletConfigController(req:Request,res:Response){const p=walletConfigSchema.safeParse(req.body);if(!p.success)return errorResponse(res,req.requestId,400,"VALIDATION_ERROR","Invalid wallet configuration",p.error.flatten());try{return successResponse(res,req.requestId,await updateConfig(req.user!.id,p.data))}catch(e){return fail(res,req.requestId,e)}}
export async function createRedeemCodeController(req:Request,res:Response){const p=createRedeemCodeSchema.safeParse(req.body);if(!p.success)return errorResponse(res,req.requestId,400,"VALIDATION_ERROR","Invalid redeem code configuration",p.error.flatten());try{return successResponse(res,req.requestId,await createRedeemCode(p.data),201)}catch(e){return fail(res,req.requestId,e)}}
export async function listRedeemCodesController(req:Request,res:Response){try{return successResponse(res,req.requestId,await listRedeemCodes())}catch(e){return fail(res,req.requestId,e)}}

export async function createMonthlyPassOrderController(req:Request,res:Response){
  const body=req.body??{};
  const pickupAddress=typeof body.pickupAddress==="string"?body.pickupAddress.trim():"";
  const dropoffAddress=typeof body.dropoffAddress==="string"?body.dropoffAddress.trim():"";
  const pickupLatitude=Number(body.pickupLatitude), pickupLongitude=Number(body.pickupLongitude);
  const dropoffLatitude=Number(body.dropoffLatitude), dropoffLongitude=Number(body.dropoffLongitude);
  if(pickupAddress.length<2||pickupAddress.length>500||dropoffAddress.length<2||dropoffAddress.length>500||
    ![pickupLatitude,pickupLongitude,dropoffLatitude,dropoffLongitude].every(Number.isFinite)||
    Math.abs(pickupLatitude)>90||Math.abs(dropoffLatitude)>90||Math.abs(pickupLongitude)>180||Math.abs(dropoffLongitude)>180)
    return errorResponse(res,req.requestId,400,"VALIDATION_ERROR","Select a valid pickup and destination for the monthly pass");
  try{return successResponse(res,req.requestId,await createMonthlyPassOrder(req.user!.id,{pickupAddress,dropoffAddress,pickupLatitude,pickupLongitude,dropoffLatitude,dropoffLongitude}),201)}catch(e){return fail(res,req.requestId,e)}
}
export async function verifyMonthlyPassPaymentController(req:Request,res:Response){
  const body=req.body??{};
  const razorpayOrderId=typeof body.razorpayOrderId==="string"?body.razorpayOrderId.trim():"";
  const razorpayPaymentId=typeof body.razorpayPaymentId==="string"?body.razorpayPaymentId.trim():"";
  const razorpaySignature=typeof body.razorpaySignature==="string"?body.razorpaySignature.trim():"";
  if(!razorpayOrderId||!razorpayPaymentId||!razorpaySignature||razorpayOrderId.length>80||razorpayPaymentId.length>80||razorpaySignature.length>256)return errorResponse(res,req.requestId,400,"VALIDATION_ERROR","Invalid monthly pass payment verification data");
  try{return successResponse(res,req.requestId,await verifyMonthlyPassPayment(req.user!.id,{razorpayOrderId,razorpayPaymentId,razorpaySignature}))}catch(e){return fail(res,req.requestId,e)}
}
