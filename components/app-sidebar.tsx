"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, ChevronDown, Zap, FileText, Eye, AlertTriangle, ScrollText, CheckCircle, LayoutTemplate, type LucideIcon } from "lucide-react" // Added CheckCircle icon
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { useBaseTemplateCounts } from "@/hooks/use-base-template-counts"
import { useRouter, usePathname } from "next/navigation"
import { Settings, HelpCircle } from "lucide-react"

const navigationItems: Array<{
  title: string
  url: string
  icon: LucideIcon
  badge?: string
}> = [
  {
    title: "Sheets",
    url: "/sheets",
    icon: FileText,
  },
  {
    title: "Review",
    url: "/review",
    icon: Eye,
  },
  {
    title: "Need Repair",
    url: "/need-repair",
    icon: AlertTriangle,
  },
  {
    title: "Checker",
    url: "/checker",
    icon: CheckCircle,
  },
  {
    title: "Base Templates",
    url: "/base-templates",
    icon: LayoutTemplate,
  },
  {
    title: "Changelog",
    url: "/changelog",
    icon: ScrollText,
  },
]

const adminItems = []

// Base Templates: yellow = in the queue with waiting orders, red = waiting for the designer.
function BaseTemplateNavBadges() {
  const { counts } = useBaseTemplateCounts()
  if (!counts) return null
  const plus = counts.partial ? "+" : ""
  return (
    <span className="ml-auto flex items-center gap-1 group-data-[collapsible=icon]:hidden">
      {counts.waiting > 0 && (
        <span
          title={`${counts.waiting}${plus} template chờ duyệt đang có đơn`}
          className="min-w-5 h-5 px-1.5 rounded-full bg-amber-400 text-amber-950 text-xs font-semibold tabular-nums flex items-center justify-center"
        >
          {counts.waiting}
          {plus}
        </span>
      )}
      {counts.repair > 0 && (
        <span
          title={`${counts.repair}${plus} template chờ designer sửa`}
          className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold tabular-nums flex items-center justify-center"
        >
          {counts.repair}
          {plus}
        </span>
      )}
    </span>
  )
}

export function AppSidebar() {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push("/login")
    } catch (error) {
      console.error("Sign out error:", error)
    }
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-gray-200">
      <SidebarHeader className="border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3 px-3 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-pink-600 text-white font-bold text-lg shadow-md">
            C
          </div>
          <div className="flex flex-col group-data-[state=collapsed]:hidden">
            <span className="text-lg font-bold text-gray-900">CheckFlow</span>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Zap className="h-3 w-3 text-pink-500" />
              Powered by PAMO
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-white">
        <SidebarGroup>
          <SidebarGroupLabel className="text-gray-700 font-medium">Main Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.url}
                    className="data-[active=true]:bg-pink-50 data-[active=true]:text-pink-700 data-[active=true]:border-r-2 data-[active=true]:border-pink-500 hover:bg-gray-50"
                  >
                    <Link href={item.url} className="flex items-center gap-3">
                      {" "}
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {item.url === "/base-templates" && <BaseTemplateNavBadges />}
                      {item.badge && (
                        <Badge variant="secondary" className="ml-auto bg-pink-100 text-pink-700 text-xs">
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-gray-200 bg-white">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="w-full hover:bg-gray-50">
                  <div className="flex items-center gap-3 w-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.avatar_url || "/placeholder.svg"} />
                      <AvatarFallback className="bg-pink-100 text-pink-700">
                        {user?.name?.charAt(0) || user?.email?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-medium text-gray-900">{user?.name || "User"}</span>
                      <span className="text-xs text-gray-500">{user?.email}</span>
                    </div>
                    <ChevronDown className="ml-auto h-4 w-4 text-gray-400" />
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                className="w-[--radix-popper-anchor-width] bg-white border border-gray-200 shadow-lg"
              >
                <DropdownMenuItem className="hover:bg-gray-50">
                  <Settings className="h-4 w-4 mr-2" />
                  Account Settings
                </DropdownMenuItem>
                <DropdownMenuItem className="hover:bg-gray-50">
                  <HelpCircle className="h-4 w-4 mr-2" />
                  Help & Support
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="hover:bg-gray-50 text-red-600 cursor-pointer" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
