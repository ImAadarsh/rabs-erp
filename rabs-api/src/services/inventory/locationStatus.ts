/**
 * Warehouses and bins that are inactive or under maintenance keep their history but must not be
 * chosen for new stock operations. Controllers call these after loading the record and return the
 * message with a 400 when it is not null.
 */
export function inactiveWarehouseError(
  warehouse: { name?: string | null; code?: string | null; status?: string | null } | null | undefined,
  role = 'Warehouse'
): string | null {
  if (!warehouse || warehouse.status === 'active') return null;
  const label = warehouse.name || warehouse.code || '';
  return `${role} "${label}" is ${warehouse.status ?? 'not active'}. Only active warehouses can be used for new operations.`;
}

export function inactiveBinError(
  bin: { code?: string | null; name?: string | null; status?: string | null; warehouse?: { name?: string | null; code?: string | null; status?: string | null } | null } | null | undefined
): string | null {
  if (!bin) return null;
  if (bin.status !== 'active') {
    return `Bin "${bin.code || bin.name || ''}" is ${bin.status ?? 'not active'}. Only active bins can be used for putaway and stock moves.`;
  }
  return bin.warehouse ? inactiveWarehouseError(bin.warehouse, 'Warehouse of this bin') : null;
}
