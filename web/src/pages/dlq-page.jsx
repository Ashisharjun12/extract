import { useCallback, useEffect, useState } from 'react'
import { BracesIcon, CopyIcon, InboxIcon, MoreVerticalIcon, RefreshCwIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { discardDLQJob, getDLQJobs, mapApiError, replayDLQJob } from '@/api/admin'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import {
  Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const PAGE_SIZE = 20

function formatJson(value) {
  return JSON.stringify(value, null, 2)
}

function formatAiCost(aiCost) {
  if (!aiCost?.apiCallCount) return '₹0 · 0 calls'
  return `₹${aiCost.totalCostINR ?? 0} · ${aiCost.apiCallCount} call${aiCost.apiCallCount === 1 ? '' : 's'}`
}

function jobJson(job) {
  return {
    id: job.id,
    originalQueue: job.originalQueue,
    failedAt: job.failedAt,
    documentType: job.documentType,
    attemptsMade: job.attemptsMade,
    aiCost: job.aiCost ?? job.errorDetails?.aiCost ?? null,
    error: job.errorDetails ?? { message: job.error },
    payload: job.payload,
  }
}

export function DLQPage() {
  const [jobs, setJobs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [pendingReplay, setPendingReplay] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [inspectJob, setInspectJob] = useState(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const fetchJobs = useCallback(async (silent = false, pageNum = 1) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const result = await getDLQJobs({ page: pageNum, limit: PAGE_SIZE })
      setJobs(result.jobs ?? [])
      setTotal(result.total ?? 0)
      setPage(result.page ?? pageNum)
    } catch (error) {
      toast.error(mapApiError(error))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchJobs(false, page) }, [fetchJobs, page])

  async function handleConfirmReplay() {
    if (!pendingReplay) return
    setActionLoading(true)
    try {
      const r = await replayDLQJob(pendingReplay.id)
      toast.success(r.message ?? 'Job replayed.')
      setPendingReplay(null)
      await fetchJobs(true, page)
    } catch (error) {
      toast.error(mapApiError(error))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return
    setActionLoading(true)
    try {
      const r = await discardDLQJob(pendingDelete.id)
      toast.success(r.message ?? 'Job deleted.')
      setPendingDelete(null)
      const nextPage = jobs.length === 1 && page > 1 ? page - 1 : page
      if (nextPage !== page) setPage(nextPage)
      else await fetchJobs(true, nextPage)
    } catch (error) {
      toast.error(mapApiError(error))
    } finally {
      setActionLoading(false)
    }
  }

  async function copyJson(job) {
    try {
      await navigator.clipboard.writeText(formatJson(jobJson(job)))
      toast.success('Copied JSON to clipboard.')
    } catch {
      toast.error('Could not copy to clipboard.')
    }
  }

  const inspectJson = inspectJob ? formatJson(jobJson(inspectJob)) : ''

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Dead letter queue</h2>
          <p className="text-sm text-muted-foreground">Replay or discard failed jobs</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchJobs(true, page)} disabled={refreshing}>
          <RefreshCwIcon className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Failed jobs</CardTitle>
          <CardDescription>
            {loading ? 'Loading…' : `${total} in DLQ · page ${page} of ${totalPages}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : total === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><InboxIcon /></EmptyMedia>
                <EmptyTitle>No failed jobs</EmptyTitle>
                <EmptyDescription>DLQ is empty.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Queue</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>AI cost</TableHead>
                    <TableHead>Failed at</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => {
                    const aiCost = job.aiCost ?? job.errorDetails?.aiCost
                    return (
                      <TableRow key={job.id}>
                        <TableCell className="max-w-[140px] truncate font-mono text-xs">{job.id}</TableCell>
                        <TableCell>{job.documentType ? <Badge variant="outline">{job.documentType}</Badge> : '—'}</TableCell>
                        <TableCell className="text-sm">{job.originalQueue ?? '—'}</TableCell>
                        <TableCell className="max-w-[200px]">
                          <p className="truncate text-sm">{job.error ?? '—'}</p>
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">
                          {formatAiCost(aiCost)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {job.failedAt ? new Date(job.failedAt).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="cursor-pointer"
                                disabled={actionLoading}
                                aria-label="Open job actions"
                              >
                                <MoreVerticalIcon />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem className="cursor-pointer" onClick={() => setInspectJob(job)}>
                                <BracesIcon />
                                JSON
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                disabled={actionLoading}
                                onClick={() => setPendingReplay(job)}
                              >
                                <RotateCcwIcon />
                                Replay
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                className="cursor-pointer"
                                onClick={() => setPendingDelete(job)}
                              >
                                <Trash2Icon />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1) }}
                        className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <span className="px-3 text-sm text-muted-foreground">
                        Page {page} of {totalPages}
                      </span>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1) }}
                        className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(inspectJob)} onOpenChange={(open) => { if (!open) setInspectJob(null) }}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>DLQ job details</DialogTitle>
            <DialogDescription className="font-mono text-xs">{inspectJob?.id}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/40 p-3">
            <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">{inspectJson}</pre>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => inspectJob && copyJson(inspectJob)}>
              <CopyIcon /> Copy JSON
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingReplay)} onOpenChange={(open) => { if (!open && !actionLoading) setPendingReplay(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replay job?</AlertDialogTitle>
            <AlertDialogDescription>
              Re-queues job <span className="font-mono text-xs">{pendingReplay?.id}</span> for processing.
              This will call Gemini again if the document is reachable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionLoading}
              onClick={(e) => { e.preventDefault(); handleConfirmReplay() }}
            >
              {actionLoading ? 'Replaying…' : 'Replay'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open && !actionLoading) setPendingDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete job permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes job <span className="font-mono text-xs">{pendingDelete?.id}</span> from the dead letter queue. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={actionLoading}
              onClick={(e) => { e.preventDefault(); handleConfirmDelete() }}
            >
              {actionLoading ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
