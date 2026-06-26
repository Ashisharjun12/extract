import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActivityIcon, FlaskConicalIcon, KeyRoundIcon, LockIcon, RefreshCwIcon } from 'lucide-react'
import { useAdminAuth } from '@/store/admin-auth.store'
import { useTesterAuth } from '@/store/tester-auth.store'
import { testAdminHealth } from '@/api/admin'
import { testTesterHealth } from '@/api/test-backend'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ModeToggle } from '@/components/ui/mode-toggle'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

function StatusDot({ online }) {
  return <span className={cn('size-2 rounded-full shrink-0', online ? 'bg-green-500' : 'bg-destructive')} />
}

function HealthRow({ label, health, loading, onRefresh }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {loading ? (
          <Badge variant="outline">Checking…</Badge>
        ) : health?.ok ? (
          <Badge variant="secondary" className="gap-1.5">
            <StatusDot online />
            Online · {health.latencyMs}ms
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1.5">
            <StatusDot online={false} />
            Offline
          </Badge>
        )}
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRefresh} disabled={loading}>
          <RefreshCwIcon className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>
    </div>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const adminAuth = useAdminAuth()
  const testerAuth = useTesterAuth()

  const [adminKey, setAdminKey] = useState('')
  const [adminError, setAdminError] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminHealth, setAdminHealth] = useState(null)
  const [adminHealthLoading, setAdminHealthLoading] = useState(true)

  const [testerPassword, setTesterPassword] = useState('')
  const [testerError, setTesterError] = useState('')
  const [testerLoading, setTesterLoading] = useState(false)
  const [testerHealth, setTesterHealth] = useState(null)
  const [testerHealthLoading, setTesterHealthLoading] = useState(true)

  const checkAdminHealth = useCallback(async () => {
    setAdminHealthLoading(true)
    setAdminHealth(await testAdminHealth())
    setAdminHealthLoading(false)
  }, [])

  const checkTesterHealth = useCallback(async () => {
    setTesterHealthLoading(true)
    setTesterHealth(await testTesterHealth())
    setTesterHealthLoading(false)
  }, [])

  useEffect(() => {
    if (adminAuth.isAuthenticated) { navigate('/admin', { replace: true }); return }
    checkAdminHealth()
  }, [adminAuth.isAuthenticated, checkAdminHealth, navigate])

  useEffect(() => {
    if (testerAuth.isAuthenticated) { navigate('/test', { replace: true }); return }
    checkTesterHealth()
  }, [testerAuth.isAuthenticated, checkTesterHealth, navigate])

  async function handleAdminLogin(e) {
    e.preventDefault()
    setAdminError('')
    setAdminLoading(true)
    try {
      await adminAuth.login(adminKey)
      navigate('/admin', { replace: true })
    } catch (err) {
      setAdminError(err.message)
    } finally {
      setAdminLoading(false)
    }
  }

  async function handleTesterLogin(e) {
    e.preventDefault()
    setTesterError('')
    setTesterLoading(true)
    try {
      await testerAuth.login(testerPassword)
      navigate('/test', { replace: true })
    } catch (err) {
      setTesterError(err.message)
    } finally {
      setTesterLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center p-4">
      <div className="absolute right-4 top-4"><ModeToggle /></div>
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold">docs-intelligence</h1>
          <p className="text-sm text-muted-foreground">Choose your portal to sign in</p>
        </div>
        <Tabs defaultValue="admin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="admin" className="gap-2">
              <ActivityIcon className="size-4" /> Admin
            </TabsTrigger>
            <TabsTrigger value="tester" className="gap-2">
              <FlaskConicalIcon className="size-4" /> Tester
            </TabsTrigger>
          </TabsList>

          <TabsContent value="admin">
            <Card>
              <CardHeader>
                <KeyRoundIcon className="mb-1 size-6" />
                <CardTitle>Admin portal</CardTitle>
                <CardDescription>Queue dashboard, DLQ — sign in with your admin API key</CardDescription>
              </CardHeader>
              <form onSubmit={handleAdminLogin}>
                <CardContent className="space-y-4">
                  <HealthRow
                    label="aimodule (via proxy)"
                    health={adminHealth}
                    loading={adminHealthLoading}
                    onRefresh={checkAdminHealth}
                  />
                  {!adminHealthLoading && !adminHealth?.ok && (
                    <Alert>
                      <AlertTitle>aimodule may be offline</AlertTitle>
                      <AlertDescription>
                        {adminHealth?.message ?? 'Could not reach aimodule via proxy.'} You can still try signing in.
                      </AlertDescription>
                    </Alert>
                  )}
                  {adminError && (
                    <Alert variant="destructive">
                      <AlertTitle>Sign-in failed</AlertTitle>
                      <AlertDescription>{adminError}</AlertDescription>
                    </Alert>
                  )}
                  <Input
                    type="password"
                    placeholder="Admin API key"
                    value={adminKey}
                    onChange={(e) => setAdminKey(e.target.value)}
                    autoComplete="off"
                    disabled={adminLoading}
                  />
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={adminLoading || !adminKey.trim()}>
                    {adminLoading ? 'Signing in…' : 'Sign in as Admin'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>

          <TabsContent value="tester">
            <Card>
              <CardHeader>
                <LockIcon className="mb-1 size-6" />
                <CardTitle>Tester portal</CardTitle>
                <CardDescription>Document extraction tester — sign in with your portal password</CardDescription>
              </CardHeader>
              <form onSubmit={handleTesterLogin}>
                <CardContent className="space-y-4">
                  <HealthRow
                    label="test-backend :3001"
                    health={testerHealth}
                    loading={testerHealthLoading}
                    onRefresh={checkTesterHealth}
                  />
                  {!testerHealthLoading && !testerHealth?.ok && (
                    <Alert>
                      <AlertTitle>test-backend may be offline</AlertTitle>
                      <AlertDescription>
                        {testerHealth?.message ?? 'Could not reach test-backend.'} Start test-backend on :3001, then try signing in.
                      </AlertDescription>
                    </Alert>
                  )}
                  {testerError && (
                    <Alert variant="destructive">
                      <AlertTitle>Sign-in failed</AlertTitle>
                      <AlertDescription>{testerError}</AlertDescription>
                    </Alert>
                  )}
                  <Input
                    type="password"
                    placeholder="Portal password"
                    value={testerPassword}
                    onChange={(e) => setTesterPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={testerLoading}
                  />
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={testerLoading || !testerPassword.trim()}>
                    {testerLoading ? 'Signing in…' : 'Sign in as Tester'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
