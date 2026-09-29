"use client"

import type React from "react"
import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"

interface MainLayoutWrapperProps {
  children: React.ReactNode
}

const getPageTitle = (pathname: string) => {
  switch (pathname) {
    case "/users":
      return "Users"
    case "/review":
      return "Order Review"
    case "/sheets":
      return "Sheets"
    case "/need-repair":
      return "Need Repair"
    case "/changelog":
      return "Changelog"
    case "/checker":
      return "Checker"
    case "/base-templates":
      return "Base Templates"
    default:
      return "CheckFlow"
  }
}

export function MainLayoutWrapper({ children }: MainLayoutWrapperProps) {
  const pathname = usePathname()
  const pageTitle = getPageTitle(pathname)

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-white sticky top-0 z-10">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <h2 className="text-lg font-semibold text-gray-900">{pageTitle}</h2>
        </header>
        <div className="bg-gray-50">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
