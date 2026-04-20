import React from 'react'
import { useStatus, useSocket } from './hooks/useApi'
import HomePage from './home-page'
import AgentsPage from './agents-page'
import TasksPage from './tasks-page'
import MemoryPage from './memory-page'
import CostPage from './cost-page'
import LogsPage from './logs-page'
import SettingsPage from './settings-page'

export default function App() {
  const status = useStatus()
  const socket = useSocket()
  
  return (
    <div>
      <nav>Navigation here...</nav>
      <HomePage />
      <AgentsPage />
      <TasksPage />
      <MemoryPage />
      <CostPage />
      <LogsPage />
      <SettingsPage />
    </div>
  )
}
