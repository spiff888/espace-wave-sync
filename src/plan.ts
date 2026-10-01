/**
 * Turns "what should be on the layout" into the smallest set of add/remove
 * operations. Cameras that stay on screen keep their tile position so the
 * TVs don't reshuffle every minute.
 */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LayoutItem extends Rect {
  id: string;
  resourceId: string;
}

export interface AddOp extends Rect {
  kind: "add";
  resourceId: string;
  slot: number;
}

export interface RemoveOp {
  kind: "remove";
  itemId: string;
  resourceId: string;
}

export type Op = AddOp | RemoveOp;

/** Slot 0 is the board (when configured); cameras use slots 1..n, or 0..n-1 without a board. */
export function slotRect(slot: number, columns: number): Rect {
  const col = slot % columns;
  const row = Math.floor(slot / columns);
  return { left: col, top: row, right: col + 1, bottom: row + 1 };
}

export function rectSlot(r: Rect, columns: number): number | undefined {
  const isUnitCell = r.right - r.left === 1 && r.bottom - r.top === 1;
  const onGrid = Number.isInteger(r.left) && Number.isInteger(r.top) && r.left >= 0 && r.top >= 0 && r.left < columns;
  return isUnitCell && onGrid ? r.top * columns + r.left : undefined;
}

export interface PlanInput {
  current: LayoutItem[];
  cameras: string[];
  boardResourceId?: string;
  columns: number;
  maxCameraTiles: number;
}

export function planLayout(input: PlanInput): Op[] {
  const { current, cameras, boardResourceId, columns, maxCameraTiles } = input;
  const boardSlots = boardResourceId ? [0] : [];
  const firstCameraSlot = boardSlots.length;
  const cameraSlots = Array.from({ length: maxCameraTiles }, (_, i) => firstCameraSlot + i);

  const ops: Op[] = [];
  const occupied = new Map<number, string>(); // slot -> resourceId
  const placed = new Set<string>();

  const keepOrRemove = (item: LayoutItem, allowedSlots: number[], wanted: boolean) => {
    const slot = rectSlot(item, columns);
    const keep =
      wanted &&
      !placed.has(item.resourceId) &&
      slot !== undefined &&
      allowedSlots.includes(slot) &&
      !occupied.has(slot);
    if (keep) {
      occupied.set(slot, item.resourceId);
      placed.add(item.resourceId);
    } else {
      ops.push({ kind: "remove", itemId: item.id, resourceId: item.resourceId });
    }
  };

  // Board first so it always claims slot 0.
  for (const item of current.filter((i) => i.resourceId === boardResourceId)) {
    keepOrRemove(item, boardSlots, true);
  }
  for (const item of current.filter((i) => i.resourceId !== boardResourceId)) {
    keepOrRemove(item, cameraSlots, cameras.includes(item.resourceId));
  }

  if (boardResourceId && !placed.has(boardResourceId)) {
    ops.push({ kind: "add", resourceId: boardResourceId, slot: 0, ...slotRect(0, columns) });
    occupied.set(0, boardResourceId);
  }

  const free = cameraSlots.filter((s) => !occupied.has(s));
  for (const cam of cameras) {
    if (placed.has(cam)) continue;
    const slot = free.shift();
    if (slot === undefined) break;
    ops.push({ kind: "add", resourceId: cam, slot, ...slotRect(slot, columns) });
    placed.add(cam);
  }

  // Removes before adds, so a slot is free before something new lands in it.
  return [...ops.filter((o) => o.kind === "remove"), ...ops.filter((o) => o.kind === "add")];
}
