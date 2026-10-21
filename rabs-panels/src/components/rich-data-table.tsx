'use client';

import React, { useState } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    flexRender,
    ColumnDef,
    SortingState,
    ColumnFiltersState,
    VisibilityState,
    PaginationState,
    FilterFn,
} from '@tanstack/react-table';
import { usePathname } from 'next/navigation';
import {
    ChevronDown,
    ChevronUp,
    ChevronsUpDown,
    Search,
    Settings2,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from 'lucide-react';

// Custom filter function for fuzzy search
function filterText(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(filterText).join(' ');
    if (typeof value === 'object') {
        const o = value as Record<string, unknown>;
        return ['name', 'sku', 'code', 'filename', 'email', 'variantSku', 'title']
            .map((k) => o[k])
            .filter((v) => v != null)
            .map(String)
            .join(' ');
    }
    return String(value);
}

const fuzzyFilter: FilterFn<any> = (row, columnId, value) => {
    const needle = String(value).toLowerCase().trim();
    if (!needle) return true;
    const direct = filterText(row.getValue(columnId)).toLowerCase();
    if (direct.includes(needle)) return true;
    const original = row.original as Record<string, unknown> | undefined;
    if (!original) return false;
    return filterText(original[columnId]).toLowerCase().includes(needle) ||
        filterText(original.catalogItem).toLowerCase().includes(needle) ||
        filterText(original.variant).toLowerCase().includes(needle);
};

// Debounced Input Component
function DebouncedInput({
    value: initialValue,
    onChange,
    debounce = 300,
    ...props
}: {
    value: string | number;
    onChange: (value: string | number) => void;
    debounce?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
    const [value, setValue] = useState(initialValue);

    React.useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    // Only emit real edits: re-emitting an unchanged value (every parent re-render passes a new
    // onChange) made column filters produce a fresh [] and bounced the table back to page 1.
    React.useEffect(() => {
        if (value === initialValue) return;
        const timeout = setTimeout(() => {
            onChange(value);
        }, debounce);

        return () => clearTimeout(timeout);
    }, [value, initialValue, debounce, onChange]);

    return (
        <input {...props} value={value} onChange={(e) => setValue(e.target.value)} />
    );
}

// `.btn` is declared outside @layer components, so its px-4/h-10 beat plain utilities; force sizing.
const pagerBtn =
    'btn btn-outline !h-8 !w-8 !p-0 !rounded-lg shrink-0 disabled:opacity-30';

/** Page indices to render, with -1 marking an ellipsis gap. */
function pageWindow(current: number, count: number): number[] {
    if (count <= 7) return Array.from({ length: count }, (_, i) => i);
    const pages = new Set<number>([0, count - 1, current - 1, current, current + 1]);
    const sorted = Array.from(pages).filter((p) => p >= 0 && p < count).sort((a, b) => a - b);
    const out: number[] = [];
    sorted.forEach((p, i) => {
        if (i > 0 && p - sorted[i - 1] > 1) out.push(-1);
        out.push(p);
    });
    return out;
}

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

type PersistedTableState = {
    pagination: PaginationState;
    sorting: SortingState;
    columnFilters: ColumnFiltersState;
    globalFilter: string;
    columnVisibility: VisibilityState;
};

function readTableState(key: string): Partial<PersistedTableState> | null {
    try {
        const raw = window.sessionStorage.getItem(key);
        return raw ? (JSON.parse(raw) as Partial<PersistedTableState>) : null;
    } catch {
        return null;
    }
}

function writeTableState(key: string, state: PersistedTableState) {
    try {
        window.sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
        // storage full / disabled: persistence is best-effort
    }
}

/** Same id resolution as TanStack: id, else accessorKey (dots -> underscores), else a string header. */
function columnIdOf(c: any): string {
    if (c.id) return String(c.id);
    if (c.accessorKey) return String(c.accessorKey).replace(/\./g, '_');
    return typeof c.header === 'string' ? c.header : '';
}

function columnSignature(columns: ColumnDef<any, any>[]): string {
    return columns.map(columnIdOf).join('|');
}

/** Field used for the implicit newest-first order: createdAt, else id, else a date-like field. */
function detectDefaultSortField(rows: unknown[]): string | null {
    const sample = rows.find((r) => r && typeof r === 'object') as Record<string, unknown> | undefined;
    if (!sample) return null;
    // Rows carrying an explicit display order are already meaningfully ordered.
    if ('position' in sample || 'sortOrder' in sample) return null;
    for (const f of ['createdAt', 'created_at', 'id']) if (f in sample) return f;
    return Object.keys(sample).find((k) => /(Date|date|At|_at)$/.test(k) && typeof sortValue(sample[k]) === 'number') ?? null;
}

function sortValue(v: unknown): number | string | null {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v.getTime();
    const s = String(v);
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const t = Date.parse(s);
        if (!Number.isNaN(t)) return t;
    }
    return s;
}

function compareDesc(a: unknown, b: unknown): number {
    const va = sortValue(a);
    const vb = sortValue(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return vb - va;
    return String(vb).localeCompare(String(va), undefined, { numeric: true });
}

interface RichDataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    searchPlaceholder?: string;
    /** Hide the built-in search box when the page already provides one. */
    hideSearch?: boolean;
    /** Explicit initial sort; when omitted rows default to newest first (createdAt, else id, else a date field). */
    initialSorting?: SortingState;
    /** Set false to keep the data's own order instead of the implicit newest-first order. */
    defaultSort?: boolean;
    /** Distinguishes several tables with identical columns on one page (state is persisted per pathname). */
    tableId?: string;
}

export function RichDataTable<TData, TValue>({
    columns,
    data,
    searchPlaceholder = 'Search...',
    hideSearch = false,
    initialSorting,
    defaultSort = true,
    tableId,
}: RichDataTableProps<TData, TValue>) {
    const pathname = usePathname();
    const [sorting, setSorting] = useState<SortingState>(initialSorting ?? []);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
    const [rowSelection, setRowSelection] = useState({});
    const [showColumnVisibility, setShowColumnVisibility] = useState(false);

    // Page, size, sort and filters survive refetches, remounts (modal close, loading swaps)
    // and Back navigation: they are kept per table in sessionStorage, keyed by pathname.
    const storageKey = `rdt:${pathname ?? ''}:${tableId ?? columnSignature(columns as ColumnDef<any, any>[])}`;
    const [restoredKey, setRestoredKey] = useState<string | null>(null);
    const restored = restoredKey === storageKey;
    const prevFilterKey = React.useRef<string | null>(null);

    useIsomorphicLayoutEffect(() => {
        const saved = readTableState(storageKey);
        if (saved) {
            const ids = new Set((columns as ColumnDef<any, any>[]).map(columnIdOf));
            const known = <T extends { id: string }>(list: T[] | undefined) =>
                Array.isArray(list) ? list.filter((s) => ids.has(s.id)) : [];
            setPagination({
                pageIndex: Math.max(0, Number(saved.pagination?.pageIndex) || 0),
                pageSize: Number(saved.pagination?.pageSize) || 10,
            });
            setSorting(saved.sorting ? known(saved.sorting) : initialSorting ?? []);
            setColumnFilters(known(saved.columnFilters));
            setGlobalFilter(typeof saved.globalFilter === 'string' ? saved.globalFilter : '');
            setColumnVisibility(saved.columnVisibility && typeof saved.columnVisibility === 'object' ? saved.columnVisibility : {});
        }
        prevFilterKey.current = null;
        setRestoredKey(storageKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey]);

    React.useEffect(() => {
        if (!restored) return;
        writeTableState(storageKey, { pagination, sorting, columnFilters, globalFilter, columnVisibility });
    }, [restored, storageKey, pagination, sorting, columnFilters, globalFilter, columnVisibility]);

    const defaultSortField = React.useMemo(
        () => (initialSorting || !defaultSort ? null : detectDefaultSortField(data as unknown[])),
        [data, initialSorting, defaultSort]
    );
    const rows = React.useMemo(() => {
        if (!defaultSortField) return data;
        return [...data].sort((a: any, b: any) => compareDesc(a?.[defaultSortField], b?.[defaultSortField]));
    }, [data, defaultSortField]);

    const table = useReactTable({
        data: rows,
        columns,
        filterFns: {
            fuzzy: fuzzyFilter,
        },
        defaultColumn: {
            filterFn: fuzzyFilter,
        },
        state: {
            sorting,
            columnFilters,
            globalFilter,
            columnVisibility,
            pagination,
            rowSelection,
        },
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onGlobalFilterChange: setGlobalFilter,
        onColumnVisibilityChange: setColumnVisibility,
        onPaginationChange: setPagination,
        onRowSelectionChange: setRowSelection,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        globalFilterFn: fuzzyFilter,
    });

    const pageCount = table.getPageCount();
    const pageIndex = pagination.pageIndex;
    const totalRows = table.getFilteredRowModel().rows.length;
    const pageSize = pagination.pageSize;

    // Clamp when the data shrinks (e.g. after a delete); an empty table while loading keeps the page.
    React.useEffect(() => {
        if (pageCount > 0 && pageIndex > pageCount - 1) table.setPageIndex(pageCount - 1);
    }, [pageCount, pageIndex, table]);

    // Back to page 1 only when the search / column filter text really changes.
    const filterKey = JSON.stringify([globalFilter, columnFilters]);
    React.useEffect(() => {
        if (!restored) return;
        if (prevFilterKey.current !== null && prevFilterKey.current !== filterKey) table.setPageIndex(0);
        prevFilterKey.current = filterKey;
    }, [filterKey, restored, table]);

    return (
        <div className="space-y-4 w-full animate-in fade-in duration-500">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-1">
                {hideSearch ? (
                    <div />
                ) : (
                    <div className="relative w-full sm:w-72 group">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                            <Search className="h-4 w-4" />
                        </div>
                        <DebouncedInput
                            value={globalFilter ?? ''}
                            onChange={(value) => setGlobalFilter(String(value))}
                            className="input !pl-12 bg-card/50 border-border/50 focus:bg-card transition-all"
                            placeholder={searchPlaceholder}
                        />
                    </div>
                )}

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <div className="relative">
                        <button
                            onClick={() => setShowColumnVisibility(!showColumnVisibility)}
                            className="btn btn-outline gap-2 w-full sm:w-auto bg-card/50 border-border/50 hover:bg-card hover:border-border transition-all"
                        >
                            <Settings2 className="h-4 w-4" />
                            <span className="hidden sm:inline">View</span>
                        </button>
                        {showColumnVisibility && (
                            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-card shadow-xl z-50 p-2 animate-in fade-in zoom-in-95 duration-200">
                                <div className="text-xs font-medium text-muted-foreground mb-2 px-2 uppercase tracking-wider">Toggle Columns</div>
                                <div className="max-h-64 overflow-y-auto space-y-1">
                                    {table.getAllLeafColumns().map((column) => {
                                        return (
                                            <div key={column.id} className="flex items-center px-2 py-1.5 hover:bg-muted rounded-lg cursor-pointer transition-colors" onClick={column.getToggleVisibilityHandler()}>
                                                <div className={`w-4 h-4 mr-2 rounded border flex items-center justify-center transition-colors ${column.getIsVisible() ? 'bg-primary border-primary' : 'border-muted-foreground'}`}>
                                                    {column.getIsVisible() && <div className="w-2 h-2 bg-white rounded-sm" />}
                                                </div>
                                                <span className="text-sm capitalize">{column.id}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {/* Overlay to close dropdown */}
                        {showColumnVisibility && (
                            <div className="fixed inset-0 z-40" onClick={() => setShowColumnVisibility(false)} />
                        )}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="table-shell overflow-hidden border border-primary/20 hover:border-primary/40 transition-colors shadow-sm bg-card/40 backdrop-blur-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="table-head text-xs uppercase bg-muted/30 sticky top-0 z-10 backdrop-blur-md">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id} className="border-b border-border/50">
                                    {headerGroup.headers.map((header) => {
                                        return (
                                            <th key={header.id} className="px-4 py-3 font-medium text-muted-foreground select-none whitespace-nowrap">
                                                {header.isPlaceholder ? null : (
                                                    <div className="space-y-2">
                                                        <div
                                                            className={`flex items-center gap-2 ${header.column.getCanSort() ? 'cursor-pointer hover:text-foreground transition-colors' : ''
                                                                }`}
                                                            onClick={header.column.getToggleSortingHandler()}
                                                        >
                                                            {flexRender(
                                                                header.column.columnDef.header,
                                                                header.getContext()
                                                            )}
                                                            {{
                                                                asc: <ChevronUp className="h-3 w-3 text-primary" />,
                                                                desc: <ChevronDown className="h-3 w-3 text-primary" />,
                                                            }[header.column.getIsSorted() as string] ?? (
                                                                    header.column.getCanSort() ? <ChevronsUpDown className="h-3 w-3 opacity-30 hover:opacity-100 transition-opacity" /> : null
                                                                )}
                                                        </div>
                                                        {/* Column Filter */}
                                                        {header.column.getCanFilter() ? (
                                                            <div onClick={(e) => e.stopPropagation()}>
                                                                <DebouncedInput
                                                                    value={(header.column.getFilterValue() ?? '') as string}
                                                                    onChange={(value) => header.column.setFilterValue(value)}
                                                                    placeholder="Filter..."
                                                                    className="h-7 text-xs w-full min-w-[100px] px-2 py-1 rounded-md border border-border/50 bg-background/50 focus:bg-background focus:border-primary/50 transition-all placeholder:text-muted-foreground/50"
                                                                />
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </th>
                                        );
                                    })}
                                </tr>
                            ))}
                        </thead>
                        <tbody className="divide-y divide-border/30">
                            {table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <tr
                                        key={row.id}
                                        data-state={row.getIsSelected() && 'selected'}
                                        className="table-row group hover:bg-muted/30 transition-colors"
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <td key={cell.id} className="px-4 py-3 align-middle">
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td
                                        colSpan={columns.length}
                                        className="h-32 text-center text-muted-foreground"
                                    >
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <Search className="h-8 w-8 opacity-20" />
                                            <p>No results found.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground px-1">
                <div className="flex-1 text-xs text-muted-foreground">
                    Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)} of {table.getFilteredRowModel().rows.length} entries
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs hidden sm:inline">Rows per page</span>
                        <select
                            value={table.getState().pagination.pageSize}
                            onChange={e => {
                                table.setPageSize(Number(e.target.value))
                            }}
                            className="h-8 w-16 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            {[10, 20, 30, 40, 50].map(pageSize => (
                                <option key={pageSize} value={pageSize}>
                                    {pageSize}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="text-xs mr-2">
                            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                        </span>
                        <button
                            className="btn btn-outline h-8 w-8 p-0 disabled:opacity-30"
                            onClick={() => table.setPageIndex(0)}
                            disabled={!table.getCanPreviousPage()}
                        >
                            <ChevronsLeft className="h-4 w-4" />
                        </button>
                        <button
                            className="btn btn-outline h-8 w-8 p-0 disabled:opacity-30"
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            className="btn btn-outline h-8 w-8 p-0 disabled:opacity-30"
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                        <button
                            className="btn btn-outline h-8 w-8 p-0 disabled:opacity-30"
                            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                            disabled={!table.getCanNextPage()}
                        >
                            <ChevronsRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
