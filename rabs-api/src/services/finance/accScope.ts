/** Roles allowed to read UK accounting data */
export const ACC_READ_ROLES = ['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT'] as const;

/** Roles allowed to write / post / approve */
export const ACC_WRITE_ROLES = ['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT'] as const;

export const ACC_ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const;
