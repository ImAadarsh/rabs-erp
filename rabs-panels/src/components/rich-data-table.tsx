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
    FilterFn,
} from '@tanstack/react-table';
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
const fuzzyFilter: FilterFn<any> = (row, columnId, value, addMeta) => {
    const itemValue = row.getValue(columnId);
    if (itemValue == null) return false;
    return String(itemValue).toLowerCase().includes(String(value).toLowerCase());
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

    React.useEffect(() => {
        const timeout = setTimeout(() => {
            onChange(value);
        }, debounce);

        return () => clearTimeout(timeout);
    }, [value, debounce, onChange]);

    return (
        <input {...props} value={value} onChange={(e) => setValue(e.target.value)} />
    );
}

interface RichDataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    searchPlaceholder?: string;
    /** Hide the built-in search box when the page already provides one. */
    hideSearch?: boolean;
}

export function RichDataTable<TData, TValue>({
    columns,
    data,
    searchPlaceholder = 'Search...',
    hideSearch = false,
}: RichDataTableProps<TData, TValue>) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [rowSelection, setRowSelection] = useState({});
    const [showColumnVisibility, setShowColumnVisibility] = useState(false);

    const table = useReactTable({
        data,
        columns,
        filterFns: {
            fuzzy: fuzzyFilter,
        },
        state: {
            sorting,
            columnFilters,
            globalFilter,
            columnVisibility,
            rowSelection,
        },
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onGlobalFilterChange: setGlobalFilter,
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        globalFilterFn: fuzzyFilter,
    });

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
