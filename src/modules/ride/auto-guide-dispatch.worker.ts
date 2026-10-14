import { prisma } from "../../core/prisma";
import { dispatchGuide } from "./auto-guide-dispatch.service";

const intervalMs = Math.max(15_000, Number(process.env.DISPATCH_MONITOR_INTERVAL_MS || 15_000));

/**
 * Recovers guide dispatch for GUIDE_ONLY and RIDE_AND_GUIDE rides after a
 * process restart, including rides whose previous offer was rejected/expired.
 * dispatchGuide enforces availability and prevents duplicate active offers.
 */
export function startAutoGuideDispatchWorker() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const rides = await prisma.ride.findMany({
        where: {
          status: { in: ["SEARCHING", "ASSIGNED"] },
          serviceType: { in: ["GUIDE_ONLY", "RIDE_AND_GUIDE"] },
          guideAssignments: { none: { status: { in: ["OFFERED", "ACCEPTED"] } } },
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      for (const ride of rides) {
        void dispatchGuide(ride.id).catch((error) => {
          console.error("Automatic guide dispatch worker failed", ride.id, error);
        });
      }
    } catch (error) {
      console.error("Automatic guide dispatch scan failed", error);
    } finally {
      running = false;
    }
  };

  void tick();
  return setInterval(() => void tick(), intervalMs);
}
