import { prisma } from "../../core/prisma";
import { notifyUser } from "../notification/notification.service";
import { scheduleRideRetry, dispatchRide } from "./auto-dispatch.service";
import { dispatchGuide, scheduleGuideRetry } from "./auto-guide-dispatch.service";
import type { AssignRideInput, CancelRideInput, CreateRideInput, LocationInput, RideEventInput } from "./ride.schema";
import { isValidRideTransition, nextRideStatus } from "./ride-transition";import { settleCompletedRidePayout } from "../provider/payout.service";
import { calculateFare } from "./fare.service";

const rideInclude = { destinations: { orderBy: { sequence: "asc" as const } }, assignments: { orderBy: { createdAt: "desc" as const }, take: 10 }, guideAssignments: { orderBy: { createdAt: "desc" as const }, take: 10 }, events: { orderBy: { createdAt: "desc" as const }, take: 20 }, locations: { orderBy: { recordedAt: "desc" as const }, take: 1 } };
async function getRideForActor(rideId:string,userId:string){const ride=await prisma.ride.findUnique({where:{id:rideId},include:rideInclude});if(!ride)throw new Error("RIDE_NOT_FOUND");const isRider=ride.riderId===userId;const isDriver=ride.assignments.some(a=>a.driverId===userId&&["OFFERED","ACCEPTED"].includes(a.status));const isGuide=ride.guideAssignments.some(a=>a.guideId===userId&&["OFFERED","ACCEPTED"].includes(a.status));if(!isRider&&!isDriver&&!isGuide)throw new Error("RIDE_ACCESS_DENIED");return ride}
async function requireDriverAssignment(userId:string,rideId:string, status?: "OFFERED"|"ACCEPTED"){const a=await prisma.rideAssignment.findFirst({where:{rideId,driverId:userId,...(status?{status}:{})},orderBy:{createdAt:"desc"}});if(!a)throw new Error("DRIVER_ASSIGNMENT_NOT_FOUND");return a}
async function requireGuideAssignment(userId:string,rideId:string, status?: "OFFERED"|"ACCEPTED"){
  const a=await prisma.guideAssignment.findFirst({where:{rideId,guideId:userId,...(status?{status}:{})},orderBy:{createdAt:"desc"}});
  if(!a)throw new Error("GUIDE_ASSIGNMENT_NOT_FOUND");
  return a;
}
async function requireApprovedDriver(userId:string){const role=await prisma.userRoleAssignment.findUnique({where:{userId_role:{userId,role:"DRIVER"}}});if(!role||!["APPROVED","VERIFIED"].includes(role.verificationStatus))throw new Error("DRIVER_NOT_VERIFIED")}
async function requireApprovedGuide(userId:string){const role=await prisma.userRoleAssignment.findUnique({where:{userId_role:{userId,role:"GUIDE"}}});if(!role||!["APPROVED","VERIFIED"].includes(role.verificationStatus))throw new Error("GUIDE_NOT_VERIFIED")}
export async function createRide(userId:string,data:CreateRideInput){if(data.serviceType!=="RIDE_ONLY"&&data.serviceType!=="GUIDE_ONLY"&&data.serviceType!=="RIDE_AND_GUIDE")throw new Error("INVALID_SERVICE_TYPE");const stops=(data.destinations??[]).map((stop)=>({latitude:stop.latitude,longitude:stop.longitude}));const fare=await calculateFare({latitude:data.pickupLatitude,longitude:data.pickupLongitude},{latitude:data.dropoffLatitude,longitude:data.dropoffLongitude},stops);const ride=await prisma.$transaction(async tx=>{let monthlyPassId:string|undefined;if(stops.length===0&&data.serviceType!=="GUIDE_ONLY"){const candidates=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM wallet_monthly_passes WHERE user_id=${userId}::uuid AND starts_at<=NOW() AND expires_at>NOW() AND remaining_rides>0 AND pickup_latitude BETWEEN ${data.pickupLatitude-0.001} AND ${data.pickupLatitude+0.001} AND pickup_longitude BETWEEN ${data.pickupLongitude-0.001} AND ${data.pickupLongitude+0.001} AND dropoff_latitude BETWEEN ${data.dropoffLatitude-0.001} AND ${data.dropoffLatitude+0.001} AND dropoff_longitude BETWEEN ${data.dropoffLongitude-0.001} AND ${data.dropoffLongitude+0.001} ORDER BY expires_at ASC LIMIT 1 FOR UPDATE`;if(candidates[0]){const used=await tx.$queryRaw<Array<{id:string}>>`UPDATE wallet_monthly_passes SET remaining_rides=remaining_rides-1 WHERE id=${candidates[0].id}::uuid AND remaining_rides>0 RETURNING id`;if(used[0])monthlyPassId=used[0].id}}const c=await tx.ride.create({data:{riderId:userId,pickupAddress:data.pickupAddress,pickupLatitude:data.pickupLatitude,pickupLongitude:data.pickupLongitude,dropoffAddress:data.dropoffAddress,dropoffLatitude:data.dropoffLatitude,dropoffLongitude:data.dropoffLongitude,serviceType:data.serviceType,purpose:data.purpose,paymentMethod:monthlyPassId?"MONTHLY_PASS":data.paymentMethod,scheduledAt:data.scheduledAt?new Date(data.scheduledAt):undefined,notes:data.notes,status:"SEARCHING",fareAmount:fare.totalFare,fareCurrency:fare.currency,fareBreakdown:fare,destinations:data.destinations?.length ? {create:data.destinations.map((stop,index)=>({sequence:index+1,name:stop.name,address:stop.address??null,latitude:stop.latitude,longitude:stop.longitude}))} : undefined},include:{...rideInclude,destinations:{orderBy:{sequence:"asc"}}}});await tx.rideEvent.create({data:{rideId:c.id,actorUserId:userId,type:"CREATED",payload:{serviceType:data.serviceType,purpose:data.purpose??null,paymentMethod:monthlyPassId?"MONTHLY_PASS":data.paymentMethod,monthlyPassId:monthlyPassId??null,destinationCount:data.destinations?.length??0,totalFare:fare.totalFare,currency:fare.currency}}});await tx.rideEvent.create({data:{rideId:c.id,actorUserId:userId,type:"SEARCH_STARTED"}});return c});void notifyUser(userId,"Ride requested","Your ride request is now searching for a driver.",{rideId:ride.id,status:ride.status,serviceType:ride.serviceType}).catch(()=>undefined);if(ride.serviceType!=="GUIDE_ONLY")void dispatchRide(ride.id).then((assignment)=>{if(!assignment)scheduleRideRetry(ride.id,1)}).catch(error=>{console.error("Automatic dispatch failed",ride.id,error);scheduleRideRetry(ride.id,1)});if(ride.serviceType!=="RIDE_ONLY")void dispatchGuide(ride.id).then((assignment)=>{if(!assignment)scheduleGuideRetry(ride.id,1)}).catch(error=>{console.error("Automatic guide dispatch failed",ride.id,error);scheduleGuideRetry(ride.id,1)});return ride}
export async function getRide(userId:string,rideId:string){return getRideForActor(rideId,userId)}
export async function listRides(userId:string,status?:string,limit=20,cursor?:string){return prisma.ride.findMany({where:{riderId:userId,...(status?{status:status as any}:{})},orderBy:{createdAt:"desc"},take:limit+1,...(cursor?{cursor:{id:cursor},skip:1}:{}),include:{assignments:{where:{status:"ACCEPTED"},take:1},guideAssignments:{where:{status:"ACCEPTED"},take:1}}})}
export async function cancelRide(userId:string,rideId:string,data:CancelRideInput){const ride=await prisma.ride.findUnique({where:{id:rideId}});if(!ride)throw new Error("RIDE_NOT_FOUND");if(ride.riderId!==userId)throw new Error("RIDE_ACCESS_DENIED");if(["COMPLETED","CANCELLED"].includes(ride.status))throw new Error("INVALID_RIDE_STATE");const updated=await prisma.$transaction(async tx=>{const r=await tx.ride.update({where:{id:rideId},data:{status:"CANCELLED",cancelledAt:new Date(),cancellationReason:data.reason},include:rideInclude});await tx.rideEvent.create({data:{rideId,actorUserId:userId,type:"CANCELLED",payload:{reason:data.reason}}});return r});const d=updated.assignments.find(a=>a.status==="ACCEPTED");if(d)void notifyUser(d.driverId,"Ride cancelled","The rider cancelled the ride.",{rideId,status:updated.status}).catch(()=>undefined);void notifyUser(userId,"Ride cancelled","Your ride has been cancelled.",{rideId,status:updated.status}).catch(()=>undefined);return updated}
export async function assignRide(userId:string,rideId:string,data:AssignRideInput){const admin=await prisma.userRoleAssignment.findUnique({where:{userId_role:{userId,role:"ADMIN"}}});if(!admin)throw new Error("ADMIN_REQUIRED");await requireApprovedDriver(data.driverId);const ride=await prisma.ride.findUnique({where:{id:rideId}});if(!ride)throw new Error("RIDE_NOT_FOUND");if(ride.serviceType==="GUIDE_ONLY")throw new Error("DRIVER_NOT_REQUIRED");if(!["REQUESTED","SEARCHING"].includes(ride.status))throw new Error("INVALID_RIDE_STATE");const assignment=await prisma.$transaction(async tx=>{const c=await tx.rideAssignment.create({data:{rideId,driverId:data.driverId,status:"OFFERED"}});await tx.ride.update({where:{id:rideId},data:{status:"ASSIGNED"}});await tx.rideEvent.create({data:{rideId,actorUserId:userId,type:"DRIVER_ASSIGNED",payload:{driverId:data.driverId}}});return c});void notifyUser(ride.riderId,"Driver assigned","A driver has been assigned to your ride.",{rideId,driverId:data.driverId,status:"ASSIGNED"}).catch(()=>undefined);void notifyUser(data.driverId,"New ride assigned","You have a new ride assignment. Please accept or reject it.",{rideId,status:assignment.status}).catch(()=>undefined);return assignment}
export async function acceptRide(userId:string,rideId:string){await requireApprovedDriver(userId);const rideState=await prisma.ride.findUnique({where:{id:rideId},select:{status:true}});if(!rideState)throw new Error("RIDE_NOT_FOUND");if(rideState.status!=="ASSIGNED")throw new Error("INVALID_RIDE_STATE");const a=await requireDriverAssignment(userId,rideId,"OFFERED");if(a.status!=="OFFERED")throw new Error("INVALID_ASSIGNMENT_STATE");const u=await prisma.$transaction(async tx=>{const accepted=await tx.rideAssignment.findFirst({where:{rideId,status:"ACCEPTED"},select:{id:true}});if(accepted)throw new Error("RIDE_ALREADY_ACCEPTED");const updated=await tx.rideAssignment.updateMany({where:{id:a.id,rideId,driverId:userId,status:"OFFERED"},data:{status:"ACCEPTED",acceptedAt:new Date()}});if(updated.count!==1)throw new Error("INVALID_ASSIGNMENT_STATE");await tx.ride.update({where:{id:rideId},data:{status:"ASSIGNED"}});await tx.rideEvent.create({data:{rideId,actorUserId:userId,type:"DRIVER_ACCEPTED"}});return tx.rideAssignment.findUnique({where:{id:a.id}})}, {isolationLevel:"Serializable"});const ride=await prisma.ride.findUnique({where:{id:rideId},select:{riderId:true}});if(ride)void notifyUser(ride.riderId,"Driver accepted","Your driver accepted the ride.",{rideId,status:u?.status}).catch(()=>undefined);return u}
export async function rejectRide(userId:string,rideId:string){await requireApprovedDriver(userId);const a=await requireDriverAssignment(userId,rideId);if(a.status!=="OFFERED")throw new Error("INVALID_ASSIGNMENT_STATE");const u=await prisma.$transaction(async tx=>{const r=await prisma.rideAssignment.updateMany({where:{id:a.id,rideId,driverId:userId,status:"OFFERED"},data:{status:"REJECTED",rejectedAt:new Date()}});if(r.count!==1)throw new Error("INVALID_ASSIGNMENT_STATE");const remaining=await tx.rideAssignment.count({where:{rideId,status:{in:["OFFERED","ACCEPTED"]}}});if(remaining===0)await tx.ride.update({where:{id:rideId},data:{status:"SEARCHING"}});await tx.rideEvent.create({data:{rideId,actorUserId:userId,type:"DRIVER_REJECTED"}});return tx.rideAssignment.findUnique({where:{id:a.id}})});const ride=await prisma.ride.findUnique({where:{id:rideId},select:{riderId:true}});if(ride)void notifyUser(ride.riderId,"Driver declined","The assigned driver declined the ride. We are searching again.",{rideId,status:"SEARCHING"}).catch(()=>undefined);scheduleRideRetry(rideId,1);return u}
export async function addLocation(userId: string, rideId: string, data: LocationInput) {
  const driverAssignment = await requireDriverAssignment(userId, rideId).catch(() => null);
  const guideAssignment = await requireGuideAssignment(userId, rideId, "ACCEPTED").catch(() => null);

  let actor: "DRIVER" | "GUIDE";

  if (driverAssignment?.status === "ACCEPTED") {
    await requireApprovedDriver(userId);
    actor = "DRIVER";
  } else if (guideAssignment?.status === "ACCEPTED") {
    await requireApprovedGuide(userId);
    actor = "GUIDE";
  } else if (guideAssignment) {
    throw new Error("GUIDE_ASSIGNMENT_NOT_ACCEPTED");
  } else if (driverAssignment) {
    throw new Error("DRIVER_ASSIGNMENT_NOT_ACCEPTED");
  } else {
    throw new Error("LOCATION_ASSIGNMENT_NOT_FOUND");
  }

  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: { status: true },
  });

  if (!ride) throw new Error("RIDE_NOT_FOUND");

  if (["COMPLETED", "CANCELLED"].includes(ride.status)) {
    throw new Error("INVALID_RIDE_STATE");
  }

  return prisma.rideLocation.create({
    data: {
      rideId,
      driverId: actor === "DRIVER" ? userId : undefined,
      guideId: actor === "GUIDE" ? userId : undefined,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy,
      recordedAt: data.recordedAt ? new Date(data.recordedAt) : new Date(),
    },
  });
}
export async function addRideEvent(userId:string,rideId:string,data:RideEventInput){
  const ride=await getRideForActor(rideId,userId);
  if(ride.riderId===userId)throw new Error("DRIVER_REQUIRED");

  const driverAssignment=ride.assignments.find(a=>a.driverId===userId&&a.status==="ACCEPTED");
  const guideAssignment=ride.guideAssignments.find(a=>a.guideId===userId&&a.status==="ACCEPTED");

  if(!driverAssignment&&!guideAssignment)throw new Error("ASSIGNMENT_NOT_ACCEPTED");
  if(guideAssignment && ride.serviceType !== "GUIDE_ONLY") throw new Error("DRIVER_REQUIRED");
  if(guideAssignment&&!driverAssignment) await requireApprovedGuide(userId);
  if(driverAssignment) await requireApprovedDriver(userId);
  if(!isValidRideTransition(ride.status, data.type))throw new Error("INVALID_RIDE_STATE");

  const next=nextRideStatus(data.type);
  const updated=await prisma.$transaction(async tx=>{
    const result=await tx.ride.updateMany({where:{id:rideId,status:ride.status},data:{status:next as any,...(next==="COMPLETED"?{completedAt:new Date()}: {})}});
    if(result.count!==1)throw new Error("INVALID_RIDE_STATE");
    const r=await tx.ride.findUnique({where:{id:rideId}});
    if(!r)throw new Error("RIDE_NOT_FOUND");
    await tx.rideEvent.create({data:{rideId,actorUserId:userId,type:data.type as any,payload:{...(data.payload as any),actorRole:guideAssignment?"GUIDE":"DRIVER"}}});
    return r
  });
  if(updated.status==="COMPLETED"&&driverAssignment){
    try{await settleCompletedRidePayout(rideId)}catch(error){console.error("Automatic driver payout failed",{rideId,error})}
  }
  const messages:Record<string,[string,string]>={DRIVER_ARRIVING:["Driver arriving","Your driver is on the way."],DRIVER_ARRIVED:["Driver arrived","Your driver has arrived at the pickup point."],RIDE_STARTED:["Ride started","Your ride has started."],NEAR_DESTINATION:["Near destination","Your ride is approaching the destination."],RIDE_COMPLETED:["Ride completed","Your ride has been completed."],INTERRUPTED:["Ride interrupted","Your ride has been temporarily interrupted."],RECOVERY_STARTED:["Ride resumed","Your ride has resumed."]};
  const [title,body]=messages[data.type];
  void notifyUser(ride.riderId,title,body,{rideId,status:updated.status}).catch(()=>undefined);
  return updated
}
export async function listEvents(userId:string,rideId:string){await getRideForActor(rideId,userId);return prisma.rideEvent.findMany({where:{rideId},orderBy:{createdAt:"asc"}})}
export async function listLocations(userId:string,rideId:string){await getRideForActor(rideId,userId);return prisma.rideLocation.findMany({where:{rideId},orderBy:{recordedAt:"asc"}})}
export { requireApprovedGuide };

/**
 * Return the latest accepted provider location for a ride after validating
 * the caller's ride access. Ride screens consume this via the authenticated
 * SSE stream endpoint.
 */
export async function getRideTrackingSnapshot(userId: string, rideId: string) {
  const ride = await getRideForActor(rideId, userId);
  const acceptedDriverIds = ride.assignments
    .filter((assignment) => assignment.status === "ACCEPTED")
    .map((assignment) => assignment.driverId);
  const acceptedGuideIds = ride.guideAssignments
    .filter((assignment) => assignment.status === "ACCEPTED")
    .map((assignment) => assignment.guideId);

  let location: {
    id: string;
    latitude: unknown;
    longitude: unknown;
    accuracy: unknown;
    recordedAt: Date;
    driverId: string | null;
    guideId: string | null;
  } | null = null;

  if (ride.serviceType === "GUIDE_ONLY" && acceptedGuideIds.length > 0) {
    location = await prisma.rideLocation.findFirst({
      where: { rideId, guideId: { in: acceptedGuideIds } },
      orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, latitude: true, longitude: true, accuracy: true, recordedAt: true, driverId: true, guideId: true },
    });
  } else if (acceptedDriverIds.length > 0) {
    location = await prisma.rideLocation.findFirst({
      where: { rideId, driverId: { in: acceptedDriverIds } },
      orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, latitude: true, longitude: true, accuracy: true, recordedAt: true, driverId: true, guideId: true },
    });
  } else if (ride.serviceType === "RIDE_AND_GUIDE" && acceptedGuideIds.length > 0) {
    location = await prisma.rideLocation.findFirst({
      where: { rideId, guideId: { in: acceptedGuideIds } },
      orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, latitude: true, longitude: true, accuracy: true, recordedAt: true, driverId: true, guideId: true },
    });
  }

  return {
    rideId: ride.id,
    status: ride.status,
    location: location ? {
      id: location.id,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      accuracy: location.accuracy == null ? null : Number(location.accuracy),
      recordedAt: location.recordedAt.toISOString(),
      providerRole: location.driverId ? "DRIVER" : "GUIDE",
    } : null,
  };
}
