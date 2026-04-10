import React, { useState } from 'react';

interface Metric {
  label: string;
  value: string | number;
  trend: 'up' | 'down' | 'flat';
}

interface Props {
  title: string;
  metrics: Metric[];
  onRefresh: () => void;
  onExport: () => void;
}

// Problem: uses raw <div> / <button> instead of the design system's
// <Card>, <Button>, and <Badge> components already available in this project.
export function DashboardCard({ title, metrics, onRefresh, onExport }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        padding: '1.5rem',
        background: '#ffffff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>{title}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={onRefresh}
            style={{
              padding: '0.25rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              background: '#fff',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Refresh
          </button>
          <button
            onClick={onExport}
            style={{
              padding: '0.25rem 0.75rem',
              border: 'none',
              borderRadius: '0.375rem',
              background: '#2563eb',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Export
          </button>
        </div>
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {(expanded ? metrics : metrics.slice(0, 3)).map((m) => (
          <div
            key={m.label}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{m.label}</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontWeight: 500 }}>{m.value}</span>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '9999px',
                  background:
                    m.trend === 'up' ? '#dcfce7' : m.trend === 'down' ? '#fee2e2' : '#f3f4f6',
                  color:
                    m.trend === 'up' ? '#16a34a' : m.trend === 'down' ? '#dc2626' : '#6b7280',
                }}
              >
                {m.trend === 'up' ? '▲' : m.trend === 'down' ? '▼' : '—'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {metrics.length > 3 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            marginTop: '0.75rem',
            background: 'none',
            border: 'none',
            color: '#2563eb',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          {expanded ? 'Show less' : `Show ${metrics.length - 3} more`}
        </button>
      )}
    </div>
  );
}
