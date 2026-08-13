import React from 'react'
import SettingPage from './SettingPage'
import UserAccountSettings from './UserAccountSettings'
import { getServerAuthStatus } from '@/utils/serverAuth'
import { getSettingsView } from '@/utils/settingsAccess'
import { notFound } from 'next/navigation'

export const metadata = {
  title: '设置 | PPTMate',
  description: 'Settings page',
}
const page = async () => {
  if (process.env.PLATFORM_MODE === 'true') {
    notFound()
  }
  const status = await getServerAuthStatus()

  return getSettingsView(status.role) === 'admin'
    ? <SettingPage />
    : <UserAccountSettings username={status.username ?? 'User'} />
}

export default page
