import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ActivityIcon, InboxIcon, LogOutIcon } from 'lucide-react'
import { useAdminAuth } from '@/store/admin-auth.store'
import { testAdminHealth } from '@/api/admin'
import { HealthBadge } from '@/components/health/health-status'
import { ModeToggle } from '@/components/ui/mode-toggle'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: ActivityIcon, end: true },
  { to: '/admin/dlq', label: 'Dead Letter Queue', icon: InboxIcon },
]

export function AdminLayout() {
  const { logout } = useAdminAuth()
  const navigate = useNavigate()

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="border-b border-sidebar-border p-4">
          <span className="text-sm font-semibold">docs-intelligence</span>
          <span className="text-xs text-muted-foreground">Admin Portal</span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map(({ to, label, icon: Icon, end }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton render={<NavLink to={to} end={end} />} tooltip={label}>
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-2">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => { logout(); navigate('/login') }}
          >
            <LogOutIcon />
            Log out
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex flex-1 items-center justify-between gap-3">
            <h1 className="text-sm font-medium">Admin Portal</h1>
            <div className="flex items-center gap-2">
              <HealthBadge healthFn={testAdminHealth} label="aimodule" />
              <ModeToggle />
            </div>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
