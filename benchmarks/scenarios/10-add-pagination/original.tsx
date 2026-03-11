import React, { useState } from 'react';

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
}

const STATUS_CLASSES = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
  pending: 'bg-yellow-100 text-yellow-800',
};

// Problem: renders ALL rows at once — will freeze the browser with 1000+ rows
export function DataTable({ rows, onRowClick }: Props) {
  const [sortKey, setSortKey] = useState<keyof Row>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

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

  const COLUMNS: { key: keyof Row; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Role' },
    { key: 'department', label: 'Department' },
    { key: 'status', label: 'Status' },
    { key: 'joined', label: 'Joined' },
  ];

  return (
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
          {sorted.map((row) => (
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
  );
}
