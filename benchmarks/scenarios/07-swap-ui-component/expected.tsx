// @ts-nocheck — fixture file: ShadCN path aliases are intentional (not a local project)
import React, { useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

const TREND_VARIANT: Record<Metric['trend'], 'success' | 'destructive' | 'secondary'> = {
  up: 'success',
  down: 'destructive',
  flat: 'secondary',
};

const TREND_ICON: Record<Metric['trend'], string> = {
  up: '▲',
  down: '▼',
  flat: '—',
};

export function DashboardCard({ title, metrics, onRefresh, onExport }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader
        title={title}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onRefresh}>
              Refresh
            </Button>
            <Button variant="default" size="sm" onClick={onExport}>
              Export
            </Button>
          </div>
        }
      />
      <CardContent>
        <div className="flex flex-col gap-2">
          {(expanded ? metrics : metrics.slice(0, 3)).map((m) => (
            <div key={m.label} className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{m.label}</span>
              <div className="flex gap-2 items-center">
                <span className="font-medium">{m.value}</span>
                <Badge variant={TREND_VARIANT[m.trend]}>{TREND_ICON[m.trend]}</Badge>
              </div>
            </div>
          ))}
        </div>
        {metrics.length > 3 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 px-0"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? 'Show less' : `Show ${metrics.length - 3} more`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
