import React, { useState, useEffect } from 'react';

interface Row {
  id: string;
  name: string;
  role: string;
  department: string;
  status: 'active' | 'inactive' | 'pending';
  joined: string;
}

interface Props {
  rows: Row[];
  onRowClick: (id: string) => void;
  pageSize?: number;
}

const STATUS_CLASSES = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
  pending: 'bg-yellow-100 text-yellow-800',
};

const COLUMNS: { key: keyof Row; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'role', label: 'Role' },
  { key: 'department', label: 'Department' },
  { key: 'status', label: 'Status' },
  { key: 'joined', label: 'Joined' },
];

export function DataTable({ rows, onRowClick, pageSize = 10 }: Props) {
  const [sortKey, setSortKey] = useState<keyof Row>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  // Reset page when sort changes
  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir]);

  const handleSort = (key: keyof Row) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] as string;
    const bv = b[sortKey] as string;
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const start = (page - 1) * pageSize;
  const visible = sorted.slice(start, start + pageSize);
  const end = Math.min(start + pageSize, sorted.length);

  // Page numbers: up to 5 around current
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => Math.abs(p - page) <= 2
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100"
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick(row.id)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3 text-gray-600">{row.role}</td>
                <td className="px-4 py-3 text-gray-600">{row.department}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[row.status]}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{row.joined}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">
          Showing {sorted.length === 0 ? 0 : start + 1}–{end} of {sorted.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-2 py-1 border rounded disabled:opacity-40"
          >
            ‹ Prev
          </button>
          {pageNumbers.map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`px-3 py-1 border rounded ${
                p === page ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-2 py-1 border rounded disabled:opacity-40"
          >
            Next ›
          </button>
        </div>
      </div>
    </div>
  );
}
