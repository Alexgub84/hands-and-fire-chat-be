/** Category & status */
export type ItemCategory = "equipment" | "food";
export type ItemStatus = "pending" | "purchased" | "packed" | "canceled";

/** Units */
export type Unit =
  | "pcs"
  | "kg"
  | "g"
  | "lb"
  | "oz"
  | "l"
  | "ml"
  | "pack"
  | "set";

/** Base (shared) fields */
export interface BaseItem {
  itemId: string;
  planId: string;

  name: string;
  quantity: number; // default 1 (in code)
  unit: Unit; // default "pcs" (in code)

  notes?: string;
  status: ItemStatus; // default "pending" (in code)

  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

/** Equipment-only (no subtypes) */
export interface EquipmentItem extends BaseItem {
  category: "equipment";
}

/** Food-only (no subtypes) */
export interface FoodItem extends BaseItem {
  category: "food";
}

/** Union if needed elsewhere */
export type Item = EquipmentItem | FoodItem;
