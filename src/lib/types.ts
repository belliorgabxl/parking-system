import type { CarSize, SpotType } from "./constants";
export type { TransactionView } from "./engine";
export type { MeView } from "@/app/api/me/route";

export type SpotDetail = {
  kind: "spot" | "transaction";
  serverNow: string;
  spot: {
    id: string;
    building: string;
    floor: string;
    zone: string;
    entrance: string;
    landmark: string;
    descriptionText: string;
    spotType: SpotType;
    carSize: CarSize;
    isLadyBay: boolean;
    leaveAt: string;
    price: number;
    heldByOther: boolean;
    heldUntil: string | null;
    heldByMe: string | null;
  };
};
