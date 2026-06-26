import { useCallback, useEffect, useState } from 'react'
import { RefreshCwIcon } from 'lucide-react'
import { testAdminHealth } from '@/api/admin'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

function StatusDot({ online }) {
  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        online ? 'bg-green-500' : 'bg-destructive',
      )}
    />
  )
}

export function HealthBadge({ pollMs = 60_000, healthFn, label }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const fn = healthFn ?? testAdminHealth

  const runCheck = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setResult(await fn())
    setLoading(false)
  }, [fn])

  useEffect(() => {
    runCheck()
    if (!pollMs) return undefined
    const interval = setInterval(() => runCheck(true), pollMs)
    return () => clearInterval(interval)
  }, [pollMs, runCheck])

  if (loading && !result) return <Skeleton className="h-6 w-24" />

  return (
    <Badge variant={result?.ok ? 'secondary' : 'destructive'} className="gap-1.5">
      <StatusDot online={result?.ok} />
      {result?.ok
        ? `${label ?? 'API'} online · ${result.latencyMs}ms`
        : `${label ?? 'API'} offline`}
    </Badge>
  )
}

export function HealthCheckCard({ autoRefreshMs = 30_000, healthFn, title }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const fn = healthFn ?? testAdminHealth

  const runCheck = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setResult(await fn())
    setLoading(false)
  }, [fn])

  useEffect(() => {
    runCheck()
    if (!autoRefreshMs) return undefined
    const interval = setInterval(() => runCheck(true), autoRefreshMs)
    return () => clearInterval(interval)
  }, [autoRefreshMs, runCheck])

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            {!loading && result && <StatusDot online={result.ok} />}
            {title ?? 'aimodule API'}
          </CardTitle>
          <CardDescription>GET /health — refreshes every 30s</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => runCheck()} disabled={loading && !result}>
          <RefreshCwIcon className={loading ? 'animate-spin' : ''} />
          Test
        </Button>
      </CardHeader>
      <CardContent>
        {loading && !result ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="flex items-center gap-2 font-medium">
                <StatusDot online={result?.ok} />
                {result?.ok ? result.message : 'Unreachable'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Latency</dt>
              <dd className="font-medium tabular-nums">
                {result?.latencyMs != null ? `${result.latencyMs} ms` : '—'}
              </dd>
            </div>
            {!result?.ok && (
              <div className="sm:col-span-2 text-destructive">{result?.message}</div>
            )}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
